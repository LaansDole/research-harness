import { describe, expect, test } from "bun:test";
import type { AgentEvent, AssistantMessage, UserMessage } from "@oh-my-pi/pi-wire";
import type { ToolResultMessage } from "@oh-my-pi/pi-wire";
import { appendMessage, type ChatState, emptyChat, entriesFromMessages, reduce } from "../src/client/agent";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { total: 0 } };
const user: UserMessage = { role: "user", content: "hi", timestamp: 1 };
const partial = (text: string): AssistantMessage => ({
	role: "assistant",
	content: [
		{ type: "text", text },
		{ type: "toolCall", id: "t1", name: "read", arguments: {} },
	],
	model: "m",
	usage,
	stopReason: "toolUse",
	timestamp: 2,
});

describe("chat reducer", () => {
	test("scripted turn yields user + assistant entries without a duplicate stream", () => {
		const before: AgentEvent[] = [
			{ type: "agent_start" },
			{ type: "message_start", message: user },
			{ type: "message_end", message: user },
			{ type: "message_update", message: partial("he") },
			{ type: "message_update", message: partial("hello") },
			{ type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: {} },
		];
		const mid = before.reduce<ChatState>(reduce, emptyChat);
		expect(mid.working).toBe(true);
		expect(mid.activeTools.has("t1")).toBe(true);
		expect(mid.stream?.content[0]).toEqual({ type: "text", text: "hello" });
		expect(mid.entries).toHaveLength(1);

		const after: AgentEvent[] = [
			{ type: "tool_execution_end", toolCallId: "t1", toolName: "read", result: {} },
			{ type: "message_end", message: partial("hello") },
			{ type: "agent_end" },
		];
		const end = after.reduce<ChatState>(reduce, mid);
		expect(end.entries.map(e => (e.type === "message" ? e.message.role : e.type))).toEqual([
			"custom_message",
			"assistant",
		]);
		expect(end.entries[1]?.parentId).toBe(end.entries[0]?.id);
		expect(end.stream).toBeNull();
		expect(end.activeTools.size).toBe(0);
		expect(end.working).toBe(false);
	});

	test("one turn's assistant messages share a row; the live reply keeps the committed row's id", () => {
		const result: ToolResultMessage = {
			role: "toolResult",
			toolCallId: "t1",
			toolName: "read",
			content: [],
			isError: false,
			timestamp: 3,
		};
		const reply = { ...partial("done"), content: [{ type: "text" as const, text: "done" }], timestamp: 4 };
		const entries = entriesFromMessages([user, partial("look"), result, reply, user, reply]);
		const shape = entries.map(e =>
			e.type === "message" && e.message.role === "assistant" ? e.message.content.map(b => b.type) : e.type,
		);
		expect(shape).toEqual(["custom_message", ["text", "toolCall", "text"], "message", "custom_message", ["text"]]);

		const live = appendMessage(entriesFromMessages([user]), partial("look"));
		const committed = reduce(
			{ ...emptyChat, entries: entriesFromMessages([user]) },
			{
				type: "message_end",
				message: partial("look"),
			},
		).entries;
		expect(live[1]?.id).toBe(committed[1]?.id);
	});
});
