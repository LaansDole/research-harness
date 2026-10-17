import { describe, expect, it } from "bun:test";
import type {
	RpcSessionEventListener,
	RpcSessionSettledListener,
} from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-client";
import { Bridge, type BridgeRpc } from "../src/bridge";
import type { BridgeFrame } from "../src/protocol";

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
	return { rpc, calls, emit: (type: "agent_start" | "agent_end") => emit({ type, messages: [] } as never) };
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
		expect(frames).toEqual([{ t: "reply", id: 1, ok: false, error: "unknown cmd: rm_rf" }]);
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
});
