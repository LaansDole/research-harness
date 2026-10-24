import { describe, expect, it } from "bun:test";
import type {
	RpcSessionEventListener,
	RpcSessionSettledListener,
} from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-client";
import { Bridge, type BridgeRpc } from "../src/bridge";
import type { BridgeFrame } from "../src/protocol";
import type { WireMessage } from "@oh-my-pi/pi-wire";

/** Records every RPC call; unused methods throw so an unexpected call fails loudly. */
function fakeRpc() {
	const calls: { name: string; args: unknown[] }[] = [];
	let emit: RpcSessionEventListener = () => {};
	const record =
		(name: string) =>
		async (...args: unknown[]) => {
			calls.push({ name, args });
			return { cancelled: false };
		};
	const rpc = {
		prompt: async (...args: unknown[]) => {
			calls.push({ name: "prompt", args });
			return "req";
		},
		abort: record("abort"),
		newSession: record("newSession"),
		switchSession: record("switchSession"),
		fork: record("fork"),
		getState: record("getState"),
		getMessages: record("getMessages"),
		getAvailableModels: record("getAvailableModels"),
		setModel: record("setModel"),
		setThinkingLevel: record("setThinkingLevel"),
		onSessionEvent: (listener: RpcSessionEventListener) => {
			emit = listener;
			return () => {};
		},
		onSessionSettled: (_listener: RpcSessionSettledListener) => () => {},
		stop: async () => {},
	} as unknown as BridgeRpc;
	return {
		rpc,
		calls,
		emit: (type: "agent_start" | "agent_end") => emit({ type, messages: [] } as never),
		emitRaw: (event: unknown) => emit(event as never),
	};
}

function setup() {
	const fake = fakeRpc();
	const frames: BridgeFrame[] = [];
	const bridge = new Bridge(fake.rpc, f => frames.push(f));
	return { ...fake, frames, bridge };
}

function failedReply(errorMessage: string) {
	return {
		role: "assistant",
		content: [],
		provider: "anthropic",
		model: "m",
		stopReason: "error",
		errorMessage,
		timestamp: 0,
	};
}

describe("Bridge", () => {
	it("rejects unknown commands without reaching the RPC client", async () => {
		const { bridge, frames, calls } = setup();
		await bridge.handle(JSON.stringify({ id: 1, cmd: "rm_rf" }));
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ t: "reply", id: 1, ok: false });
		expect(calls).toEqual([]);
	});

	it("queues a prompt as followUp while the agent is working", async () => {
		const { bridge, calls, emit } = setup();
		await bridge.handle(JSON.stringify({ id: 1, cmd: "prompt", message: "a" }));
		emit("agent_start");
		await bridge.handle(JSON.stringify({ id: 2, cmd: "prompt", message: "b" }));
		emit("agent_end");
		await bridge.handle(JSON.stringify({ id: 3, cmd: "prompt", message: "c" }));
		expect(calls.map(c => c.args[2])).toEqual([undefined, "followUp", undefined]);
	});

	it("refuses to switch to a session path that was not listed", async () => {
		const { bridge, frames, calls } = setup();
		await bridge.handle(JSON.stringify({ id: 7, cmd: "switch_session", path: "/etc/passwd" }));
		expect(frames[0]).toMatchObject({ t: "reply", id: 7, ok: false });
		expect(calls).toEqual([]);
	});

	it("shows researchers a plain reason instead of the provider's raw error", async () => {
		const { bridge, frames, emitRaw, rpc } = setup();
		emitRaw({
			type: "message_end",
			message: failedReply('429 {"type":"error","error":{"type":"rate_limit_error","message":"usage limit"}}'),
		});
		emitRaw({ type: "message_end", message: failedReply("prompt is too long: 250000 tokens > 200000 maximum") });
		rpc.getMessages = async () => [failedReply("socket hang up ECONNRESET")] as never;
		await bridge.handle(JSON.stringify({ id: 1, cmd: "get_messages" }));
		const errorOf = (m: WireMessage) => (m.role === "assistant" ? m.errorMessage : undefined);
		const shown = frames.flatMap(f =>
			f.t === "event" && f.event.type === "message_end"
				? [errorOf(f.event.message)]
				: f.t === "reply" && f.ok && Array.isArray(f.data)
					? f.data.map(errorOf)
					: [],
		);
		expect(shown).toHaveLength(3);
		for (const text of shown) {
			expect(text).toBeString();
			expect(text).not.toMatch(/429|rate_limit_error|250000|ECONNRESET|socket hang up/);
		}
		// Usage limit, an over-long conversation and a dropped connection call for different actions.
		expect(new Set(shown).size).toBe(3);
	});

	it("toasts plain warnings as is and rewrites notices carrying paths, errno codes or JSON", () => {
		const { frames, emitRaw } = setup();
		const plain = [
			{ message: "Could not restore model anthropic/claude-opus-4. Using openai/gpt-5" },
			{
				source: "compaction",
				message: "Response hit the anthropic/m output limit (8192 tokens) and was truncated.",
			},
			{ source: "advisor", message: 'Advisor "Reviewer" quota exhausted — pausing until reset.' },
			{ source: "collab", message: "Collab ended: the host closed the session" },
		];
		const raw = [
			{
				source: "session-persistence",
				message: "EACCES: permission denied, open '/Users/x/.omp/agent/sessions/a.jsonl'",
			},
			{ source: "advisor", message: "Advisor unavailable for anthropic/m: socket hang up ECONNRESET" },
			{ source: "extensions", message: "Failed to load extension ~/.omp/extensions/x.ts: SyntaxError" },
			{ source: "advisor", message: 'Advisor unavailable for anthropic/m: 429 {"type":"error"}' },
		];
		for (const notice of [...plain, ...raw]) emitRaw({ type: "notice", level: "warning", ...notice });
		const shown = frames.flatMap(f => (f.t === "event" && f.event.type === "notice" ? [f.event.message] : []));
		expect(shown.slice(0, plain.length)).toEqual(plain.map(notice => notice.message));
		const rewritten = shown.slice(plain.length);
		expect(rewritten).toHaveLength(raw.length);
		for (const text of rewritten) expect(text).not.toMatch(/EACCES|ECONNRESET|\/Users\/|~\/|429|\{"/);
		// A failed save keeps its own reason: the researcher learns recent messages may be lost.
		expect(rewritten[0]).not.toBe(rewritten[1]);
	});

	it("keeps raw error text out of turn, run, retry and compaction events", () => {
		const { frames, emitRaw } = setup();
		const raw = '429 {"type":"error","error":{"type":"rate_limit_error"}}';
		emitRaw({ type: "turn_end", message: failedReply(raw), toolResults: [] });
		emitRaw({ type: "agent_end", messages: [failedReply(raw)] });
		emitRaw({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1000, errorMessage: raw });
		emitRaw({ type: "auto_retry_end", success: false, attempt: 3, finalError: raw, retryErrors: [{ note: raw }] });
		emitRaw({
			type: "auto_compaction_end",
			aborted: false,
			willRetry: false,
			errorMessage: "ENOENT: no such file or directory, open '/Users/x/.omp/a.jsonl'",
		});
		expect(frames.map(f => (f.t === "event" ? f.event.type : f.t))).toEqual([
			"turn_end",
			"agent_end",
			"auto_retry_start",
			"auto_retry_end",
			"auto_compaction_end",
		]);
		expect(JSON.stringify(frames)).not.toMatch(/429|rate_limit_error|ENOENT|\/Users\//);
	});
});
