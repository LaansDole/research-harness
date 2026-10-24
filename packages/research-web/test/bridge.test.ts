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

describe("Bridge", () => {
	it("rejects unknown commands without reaching the RPC client", async () => {
		const { bridge, frames, calls } = setup();
		await bridge.handle(JSON.stringify({ id: 1, cmd: "rm_rf" }));
		expect(frames).toEqual([{ t: "reply", id: 1, ok: false, error: "That action isn't supported." }]);
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
		const failed = (errorMessage: string) => ({
			role: "assistant",
			content: [],
			provider: "anthropic",
			model: "m",
			stopReason: "error",
			errorMessage,
			timestamp: 0,
		});
		const { bridge, frames, emitRaw, rpc } = setup();
		emitRaw({
			type: "message_end",
			message: failed('429 {"type":"error","error":{"type":"rate_limit_error","message":"usage limit"}}'),
		});
		emitRaw({ type: "message_end", message: failed("prompt is too long: 250000 tokens > 200000 maximum") });
		rpc.getMessages = async () => [failed("socket hang up ECONNRESET")] as never;
		await bridge.handle(JSON.stringify({ id: 1, cmd: "get_messages" }));
		const errorOf = (m: WireMessage) => (m.role === "assistant" ? m.errorMessage : undefined);
		const shown = frames.flatMap(f =>
			f.t === "event" && f.event.type === "message_end"
				? [errorOf(f.event.message)]
				: f.t === "reply" && f.ok && Array.isArray(f.data)
					? f.data.map(errorOf)
					: [],
		);
		expect(shown).toEqual([
			"You've hit the model provider's usage limit. Wait a while, or pick another model in the message box.",
			"This conversation has grown too long for the model. Start a new session, or pick a model with a larger context.",
			"The model provider is busy or unreachable right now. Try again in a moment.",
		]);
	});

	it("replaces warning notices (paths, errno) with a plain sentence and leaves info notices alone", () => {
		const { frames, emitRaw } = setup();
		emitRaw({
			type: "notice",
			level: "error",
			source: "session-persistence",
			message: "EACCES: permission denied, open '/Users/x/.omp/agent/sessions/a.jsonl'",
		});
		emitRaw({ type: "notice", level: "info", message: "Context compacted" });
		const notices = frames.flatMap(f => (f.t === "event" && f.event.type === "notice" ? [f.event.message] : []));
		expect(notices).toEqual([
			"Couldn't save this session to disk, so recent messages may not be kept. The details are in the omp log.",
			"Context compacted",
		]);
	});
});
