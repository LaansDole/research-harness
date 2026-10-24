import * as path from "node:path";
import type { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { ImageContent } from "@oh-my-pi/pi-ai";
import type { RpcClient } from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-client";
import {
	isEmptySession,
	listSessionsReadOnly,
	sessionDisplayName,
} from "@oh-my-pi/pi-coding-agent/session/session-listing";
import { FileSessionStorage } from "@oh-my-pi/pi-coding-agent/session/session-storage";
import { logger } from "@oh-my-pi/pi-utils";
import type { AgentEvent as WireAgentEvent } from "@oh-my-pi/pi-wire";
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
				send({ t: "event", event: event as WireAgentEvent });
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
				return rpc.getMessages();
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
