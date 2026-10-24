import { afterEach, expect, test } from "bun:test";
// Defines HTMLElement before collab-web's tool renderer module subclasses it at load.
import "@oh-my-pi/collab-web/test/transcript-dom-shim";
import { Transcript } from "@oh-my-pi/collab-web/src/components/transcript/Transcript";
import { type DOMWindow, parseHTML } from "@oh-my-pi/pi-utils/dom";
import type { WireMessage } from "@oh-my-pi/pi-wire";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { entriesFromMessages } from "../src/client/agent";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { total: 0 } };
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
let root: Root | null = null;

function installWindow(window: DOMWindow): void {
	const globals: Record<string, unknown> = {
		window,
		document: window.document,
		navigator: window.navigator,
		Node: window.Node,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		HTMLIFrameElement: window.HTMLIFrameElement,
		SVGElement: window.SVGElement,
		Event: window.Event,
		IS_REACT_ACT_ENVIRONMENT: true,
	};
	for (const [name, value] of Object.entries(globals)) {
		originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
	}
}

afterEach(async () => {
	if (root) {
		await act(async () => root?.unmount());
		root = null;
	}
	for (const [name, descriptor] of originalGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	originalGlobals.clear();
});

/** One finished turn, as `get_messages` returns a saved session: a question, then thinking and an answer. */
function savedSession(startedAt: number, answer: string): WireMessage[] {
	return [
		{ role: "user", content: "Where does my review stand?", timestamp: startedAt },
		{
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "Read the review store first." },
				{ type: "text", text: answer },
			],
			model: "m",
			usage,
			stopReason: "stop",
			timestamp: startedAt + 1,
		},
	];
}

test("a fold opened in one session is closed when another session loads", async () => {
	const window = parseHTML('<html><body><div id="root"></div></body></html>');
	installWindow(window);
	const container = window.document.getElementById("root");
	if (!container) throw new Error("missing root");
	root = createRoot(container as unknown as globalThis.Element);
	// App swaps the transcript's entries in place when the researcher opens another session.
	const show = (messages: WireMessage[]) => {
		const entries = entriesFromMessages(messages);
		return act(async () => {
			root?.render(
				<Transcript
					entries={entries}
					committedEntries={entries}
					stream={null}
					streamDone
					activeTools={new Map()}
					working={false}
					foldActivity
				/>,
			);
		});
	};
	const fold = () => container.querySelector(".tr-think-head[aria-expanded]");

	await show(savedSession(1_000, "Four papers are included."));
	await act(async () => {
		fold()?.dispatchEvent(new window.Event("click", { bubbles: true }));
	});
	expect(fold()?.getAttribute("aria-expanded")).toBe("true");

	await show(savedSession(9_000, "Nothing screened yet."));
	expect(container.textContent).toContain("Nothing screened yet.");
	expect(fold()?.getAttribute("aria-expanded")).toBe("false");
});
