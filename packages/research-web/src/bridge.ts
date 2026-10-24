import * as path from "node:path";
import type { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { AssistantMessage, ImageContent } from "@oh-my-pi/pi-ai";
import * as AIError from "@oh-my-pi/pi-ai/error";
import type { RpcClient } from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-client";
import {
	isEmptySession,
	listSessionsReadOnly,
	sessionDisplayName,
} from "@oh-my-pi/pi-coding-agent/session/session-listing";
import { FileSessionStorage } from "@oh-my-pi/pi-coding-agent/session/session-storage";
import { logger } from "@oh-my-pi/pi-utils";
import type { WireMessage, AgentEvent as WireAgentEvent } from "@oh-my-pi/pi-wire";
import type { BridgeCommand, BridgeFrame, SessionListItem } from "./protocol";

export type BridgeRpc = Pick<
	RpcClient,
	| "prompt"
	| "abort"
	| "newSession"
	| "switchSession"
	| "fork"
	| "getState"
	| "getMessages"
	| "getAvailableModels"
	| "setModel"
	| "setThinkingLevel"
	| "onSessionEvent"
	| "onSessionSettled"
	| "stop"
>;

/** Raw frame after JSON.parse; fields are checked before use. */
type RawCommand = Record<string, unknown>;

/** What the researcher was trying to do, per command; failures are reported as "Couldn't <action>." */
const ACTION_BY_CMD: Record<string, string> = {
	prompt: "send your message",
	abort: "stop the agent",
	new_session: "start a new session",
	switch_session: "open that session",
	fork: "fork this session",
	get_state: "load the session details",
	get_messages: "load the conversation",
	get_available_models: "load the model list",
	set_model: "switch the model",
	set_thinking_level: "change the thinking level",
	list_sessions: "load your sessions",
};

function str(cmd: RawCommand, key: string): string {
	const value = cmd[key];
	if (typeof value !== "string") throw new Error(`${key} must be a string`);
	return value;
}

const { Flag } = AIError;

const STOPPED = "Stopped before finishing.";
/** Researcher-facing reasons for a failed reply; first matching flag wins. */
const FAILURE_REASONS: [flags: AIError.Flag[], text: string][] = [
	[[Flag.UserInterrupt, Flag.Abort, Flag.SilentAbort], STOPPED],
	[
		[Flag.AuthFailed, Flag.OAuthExpiry],
		"The model provider didn't accept your sign-in. Log in again by running omp in a terminal, then retry.",
	],
	[
		[Flag.UsageLimit],
		"You've hit the model provider's usage limit. Wait a while, or pick another model in the sidebar.",
	],
	[[Flag.AccountPolicy], "Your account can't use this model. Pick another model in the sidebar."],
	[
		[Flag.ContextOverflow, Flag.PayloadRejected],
		"This conversation has grown too long for the model. Start a new session, or pick a model with a larger context.",
	],
	[[Flag.ContentBlocked], "The model provider declined this request. Try rewording it."],
	[[Flag.Transient, Flag.Timeout], "The model provider is busy or unreachable right now. Try again in a moment."],
];
const MODEL_FAILED =
	"The model ran into a problem and stopped. Try again; if it keeps happening, the details are in the omp log.";

/**
 * Replaces a failed reply's raw provider error (HTTP status, JSON body) with a sentence a researcher can act on.
 * `log` records the raw error once, when the reply ends live; history replays skip it.
 */
function forDisplay(message: WireMessage, log: boolean): WireMessage {
	if (message.role !== "assistant") return message;
	if (message.stopReason === "aborted") return { ...message, errorMessage: STOPPED };
	if (message.stopReason !== "error") return message;
	if (log) {
		logger.warn("research-web: model reply failed", { model: message.model, error: message.errorMessage });
	}
	// classifyMessage writes errorId onto its argument; classify a copy.
	const id = AIError.classifyMessage({ ...(message as AssistantMessage) });
	const reason = FAILURE_REASONS.find(([flags]) => flags.some(f => AIError.is(id, f)))?.[1] ?? MODEL_FAILED;
	return { ...message, errorMessage: reason };
}

/** Agent notices carry file paths and errno codes; the toast gets a plain sentence, the log the original. */
function noticeText(source: string | undefined): string {
	return source === "session-persistence"
		? "Couldn't save this session to disk, so recent messages may not be kept. The details are in the omp log."
		: "The agent reported a problem. The details are in the omp log.";
}

function eventForDisplay(event: WireAgentEvent): WireAgentEvent {
	switch (event.type) {
		case "message_start":
		case "message_update":
		case "message_end":
			return { ...event, message: forDisplay(event.message, event.type === "message_end") };
		case "notice":
			if (event.level === "info") return event;
			logger.warn("research-web: agent notice", { source: event.source, message: event.message });
			return { ...event, message: noticeText(event.source) };
		default:
			return event;
	}
}

/** Translates allowlisted WebSocket commands into `RpcClient` calls; one per connection. */
export class Bridge {
	#rpc: BridgeRpc;
	#send: (f: BridgeFrame) => void;
	#working = false;
	/** Paths from the last `list_sessions`; `switch_session` accepts only these. */
	#listed = new Set<string>();
	#unsubscribe: (() => void)[];

	constructor(rpc: BridgeRpc, send: (f: BridgeFrame) => void) {
		this.#rpc = rpc;
		this.#send = send;
		this.#unsubscribe = [
			rpc.onSessionEvent(event => {
				if (event.type === "agent_start") this.#working = true;
				else if (event.type === "agent_end") this.#working = false;
				// Wire union is the client-rendered subset; other variants pass through as plain JSON.
				send({ t: "event", event: eventForDisplay(event as WireAgentEvent) });
			}),
			rpc.onSessionSettled(() => send({ t: "settled" })),
		];
	}

	async handle(raw: string): Promise<void> {
		let id = -1;
		let action: string | undefined;
		try {
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				throw new Error("frame must be a JSON object");
			}
			const cmd = parsed as RawCommand;
			if (typeof cmd.id !== "number") throw new Error("id must be a number");
			id = cmd.id;
			action = Object.hasOwn(ACTION_BY_CMD, String(cmd.cmd)) ? ACTION_BY_CMD[String(cmd.cmd)] : undefined;
			const data = await this.#dispatch(cmd);
			this.#send({ t: "reply", id, ok: true, data });
		} catch (error) {
			logger.warn("research-web: bridge command failed", {
				action: action ?? "unsupported",
				error: error instanceof Error ? error.message : String(error),
			});
			const message = action
				? `Couldn't ${action}. Try again; if it keeps happening, the details are in the omp log.`
				: "That action isn't supported.";
			this.#send({ t: "reply", id, ok: false, error: message });
		}
	}

	async #dispatch(cmd: RawCommand): Promise<unknown> {
		const rpc = this.#rpc;
		switch (cmd.cmd as BridgeCommand["cmd"]) {
			case "prompt": {
				const images = cmd.images;
				if (images !== undefined && !Array.isArray(images)) throw new Error("images must be an array");
				return rpc.prompt(
					str(cmd, "message"),
					images as ImageContent[] | undefined,
					this.#working ? "followUp" : undefined,
				);
			}
			case "abort":
				return rpc.abort();
			case "new_session":
				return rpc.newSession();
			case "switch_session": {
				const target = str(cmd, "path");
				if (!this.#listed.has(target)) throw new Error("unknown session path");
				return rpc.switchSession(target);
			}
			case "fork":
				return rpc.fork(cmd.entryId === undefined ? undefined : str(cmd, "entryId"));
			case "get_state":
				return rpc.getState();
			case "get_messages":
				return ((await rpc.getMessages()) as WireMessage[]).map(m => forDisplay(m, false));
			case "get_available_models":
				return rpc.getAvailableModels();
			case "set_model":
				return rpc.setModel(str(cmd, "provider"), str(cmd, "modelId"));
			case "set_thinking_level":
				// The agent validates the level value.
				return rpc.setThinkingLevel(str(cmd, "level") as ThinkingLevel);
			case "list_sessions":
				return this.#listSessions();
			default:
				throw new Error(`unknown cmd: ${String(cmd.cmd)}`);
		}
	}

	async #listSessions(): Promise<SessionListItem[]> {
		const { sessionFile } = await this.#rpc.getState();
		if (!sessionFile) {
			this.#listed = new Set();
			return [];
		}
		const infos = await listSessionsReadOnly(path.dirname(sessionFile), new FileSessionStorage());
		const items = infos
			.filter(info => !isEmptySession(info))
			.sort((a, b) => b.modified.getTime() - a.modified.getTime())
			.map(info => ({
				path: info.path,
				id: info.id,
				title: sessionDisplayName(info),
				modified: info.modified.toISOString(),
			}));
		this.#listed = new Set(items.map(item => item.path));
		return items;
	}

	async dispose(): Promise<void> {
		for (const off of this.#unsubscribe) off();
		await this.#rpc.stop();
	}
}
