/**
 * Chat state for the research web client: a pure reducer over bridge agent
 * events (semantics mirror collab-web `GuestClient#applyEvent`) plus the
 * WebSocket connection that speaks the bridge protocol.
 */
import type { ActiveTool } from "@oh-my-pi/collab-web/src/lib/client";
import type { AgentEvent, AssistantMessage, SessionEntry, WireMessage } from "@oh-my-pi/pi-wire";
import { COLLAB_PROMPT_MESSAGE_TYPE } from "@oh-my-pi/pi-wire";
import type { BridgeCommand, BridgeFrame } from "../protocol";

export type { ActiveTool };

export interface ChatState {
	entries: SessionEntry[];
	stream: AssistantMessage | null;
	streamDone: boolean;
	activeTools: ReadonlyMap<string, ActiveTool>;
	working: boolean;
}

export const emptyChat: ChatState = {
	entries: [],
	stream: null,
	streamDone: false,
	activeTools: new Map(),
	working: false,
};

/** Roles Transcript renders; everything else (custom/bash/…) is dropped. */
const RENDERED_ROLES: Record<string, true> = { user: true, assistant: true, toolResult: true };

function messageEntry(message: WireMessage, index: number): SessionEntry {
	const base = {
		id: `m${index}`,
		parentId: index === 0 ? null : `m${index - 1}`,
		timestamp: new Date(message.timestamp || 0).toISOString(),
	};
	// ponytail: Transcript hard-codes the "host" gutter for user messages; its
	// collab-prompt entry is the only seam that takes a label, so reuse it for "you".
	if (message.role === "user") {
		return {
			...base,
			type: "custom_message",
			customType: COLLAB_PROMPT_MESSAGE_TYPE,
			content: message.content,
			details: { from: "you" },
			display: true,
		};
	}
	return { ...base, type: "message", message };
}

/** The assistant entry this turn's next assistant message joins; -1 once a user message starts a new turn. */
function turnAssistantIndex(entries: readonly SessionEntry[]): number {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "message") return -1;
		if (entry.message.role === "assistant") return i;
		if (entry.message.role !== "toolResult") return -1;
	}
	return -1;
}

/**
 * Adds `message` as an entry. An assistant message continues its turn's assistant entry, so a whole turn
 * renders as one row whose thinking and tool calls fold together; the entry keeps its id (the React key).
 */
export function appendMessage(entries: readonly SessionEntry[], message: WireMessage): SessionEntry[] {
	if (message.role === "assistant") {
		const i = turnAssistantIndex(entries);
		const prev = entries[i];
		if (prev?.type === "message" && prev.message.role === "assistant") {
			const next = [...entries];
			// Stop reason, error and usage come from the newest message: a turn that recovered (auto-retry)
			// after an earlier failure shows its outcome, not the stale error.
			next[i] = { ...prev, message: { ...message, content: [...prev.message.content, ...message.content] } };
			return next;
		}
	}
	return [...entries, messageEntry(message, entries.length)];
}

export function entriesFromMessages(messages: readonly WireMessage[]): SessionEntry[] {
	let entries: SessionEntry[] = [];
	for (const message of messages) {
		if (RENDERED_ROLES[message.role]) entries = appendMessage(entries, message);
	}
	return entries;
}

export function reduce(state: ChatState, event: AgentEvent): ChatState {
	switch (event.type) {
		case "message_start":
		case "message_update":
			if (event.message.role !== "assistant") return state;
			return { ...state, stream: event.message, streamDone: false };
		case "message_end": {
			if (!RENDERED_ROLES[event.message.role]) return state;
			const entries = appendMessage(state.entries, event.message);
			// The committed entry supersedes the stream ghost so it never renders twice.
			if (event.message.role === "assistant") return { ...state, entries, stream: null, streamDone: false };
			return { ...state, entries };
		}
		case "tool_execution_start": {
			const tool: ActiveTool = {
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				intent: event.intent,
				startedAt: Date.now(),
			};
			return { ...state, activeTools: new Map(state.activeTools).set(event.toolCallId, tool) };
		}
		case "tool_execution_update": {
			const existing = state.activeTools.get(event.toolCallId);
			const tool: ActiveTool = existing
				? { ...existing, partialResult: event.partialResult }
				: {
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						args: event.args,
						partialResult: event.partialResult,
						startedAt: Date.now(),
					};
			return { ...state, activeTools: new Map(state.activeTools).set(event.toolCallId, tool) };
		}
		case "tool_execution_end": {
			const activeTools = new Map(state.activeTools);
			activeTools.delete(event.toolCallId);
			return { ...state, activeTools };
		}
		case "agent_start":
			return { ...state, working: true };
		case "agent_end":
			// Idle implies no tool is running: drop cards pinned by a lost tool_execution_end.
			return { ...state, working: false, activeTools: new Map(), stream: null, streamDone: false };
		default:
			return state;
	}
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CommandBody = DistributiveOmit<BridgeCommand, "id">;

/** Subset of the `get_state` reply the UI reads. */
export interface AgentState {
	model?: { provider: string; id: string };
	thinkingLevel?: string;
	sessionFile?: string;
	isStreaming: boolean;
}

/** Subset of a `get_available_models` item. */
export interface ModelRef {
	provider: string;
	id: string;
}

/** Why the chat stopped: the agent process died, or the browser lost the research web server. */
export interface ExitInfo {
	reason: "agent" | "connection";
}

const NOT_RUNNING = "The research agent isn't running. Press Reconnect to start it again.";

/** One WebSocket = one omp child. Reconnect by constructing a new instance. */
export class AgentConnection {
	readonly #ws: WebSocket;
	readonly #open = Promise.withResolvers<void>();
	readonly #pending = new Map<number, PromiseWithResolvers<unknown>>();
	readonly #eventListeners = new Set<(event: AgentEvent) => void>();
	readonly #settledListeners = new Set<() => void>();
	readonly #exitListeners = new Set<(info: ExitInfo) => void>();
	#seq = 0;
	#exited = false;

	constructor(url: string) {
		this.#ws = new WebSocket(url);
		this.#ws.onopen = () => this.#open.resolve();
		this.#ws.onmessage = msg => this.#onFrame(JSON.parse(String(msg.data)) as BridgeFrame);
		this.#ws.onclose = () => this.#exit({ reason: "connection" });
		// Avoid an unhandled rejection when nobody is awaiting the open.
		this.#open.promise.catch(() => {});
	}

	async request<T>(body: CommandBody): Promise<T> {
		await this.#open.promise;
		if (this.#exited) throw new Error(NOT_RUNNING);
		const id = ++this.#seq;
		const pending = Promise.withResolvers<unknown>();
		this.#pending.set(id, pending);
		this.#ws.send(JSON.stringify({ ...body, id }));
		return pending.promise as Promise<T>;
	}

	subscribe(listener: (event: AgentEvent) => void): () => void {
		this.#eventListeners.add(listener);
		return () => this.#eventListeners.delete(listener);
	}

	onSettled(listener: () => void): () => void {
		this.#settledListeners.add(listener);
		return () => this.#settledListeners.delete(listener);
	}

	onExit(listener: (info: ExitInfo) => void): () => void {
		this.#exitListeners.add(listener);
		return () => this.#exitListeners.delete(listener);
	}

	close(): void {
		this.#exitListeners.clear();
		this.#ws.close();
	}

	#onFrame(frame: BridgeFrame): void {
		switch (frame.t) {
			case "reply": {
				const pending = this.#pending.get(frame.id);
				if (!pending) return;
				this.#pending.delete(frame.id);
				if (frame.ok) pending.resolve(frame.data);
				else pending.reject(new Error(frame.error));
				return;
			}
			case "event":
				for (const listener of this.#eventListeners) listener(frame.event);
				return;
			case "settled":
				for (const listener of this.#settledListeners) listener();
				return;
			case "exit":
				this.#exit({ reason: "agent" });
				return;
		}
	}

	#exit(info: ExitInfo): void {
		if (this.#exited) return;
		this.#exited = true;
		this.#open.reject(new Error(NOT_RUNNING));
		for (const pending of this.#pending.values()) pending.reject(new Error(NOT_RUNNING));
		this.#pending.clear();
		for (const listener of this.#exitListeners) listener(info);
	}
}
