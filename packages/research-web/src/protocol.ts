/**
 * WebSocket frame contract between the research-web server bridge and the browser.
 * Pure types over `@oh-my-pi/pi-wire` (dependency-free JSON shapes) so the DOM-typed
 * client never pulls in coding-agent sources.
 */
import type { AgentEvent, ImageContent } from "@oh-my-pi/pi-wire";

/** Client → server. Anything outside this allowlist is answered `ok:false`. */
export type BridgeCommand =
	| { id: number; cmd: "prompt"; message: string; images?: ImageContent[] }
	| { id: number; cmd: "abort" }
	| { id: number; cmd: "new_session" }
	| { id: number; cmd: "switch_session"; path: string }
	| { id: number; cmd: "fork"; entryId?: string }
	| { id: number; cmd: "get_state" }
	| { id: number; cmd: "get_messages" }
	| { id: number; cmd: "get_available_models" }
	| { id: number; cmd: "set_model"; provider: string; modelId: string }
	| { id: number; cmd: "set_thinking_level"; level: string }
	| { id: number; cmd: "list_sessions" };

/** Server → client. */
export type BridgeFrame =
	| { t: "reply"; id: number; ok: true; data: unknown }
	| { t: "reply"; id: number; ok: false; error: string }
	/** Every agent session event; the wire union covers the variants the client renders. */
	| { t: "event"; event: AgentEvent }
	| { t: "settled" }
	/** The omp child stopped; its exit code and stderr stay in the server's omp log. */
	| { t: "exit" };

export interface SessionListItem {
	path: string;
	id: string;
	title: string;
	/** ISO timestamp. */
	modified: string;
}
