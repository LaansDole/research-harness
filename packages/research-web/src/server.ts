#!/usr/bin/env bun
import { RpcClient } from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-client";
import { ptree } from "@oh-my-pi/pi-utils";
import { Bridge } from "./bridge";
import index from "./client/index.html";
import { loadConfig, type ResearchConfig } from "./config";
import { type DataHandler, dataRoutes } from "./data";
import { checkRequest } from "./guard";
import type { BridgeFrame } from "./protocol";

type ExitListener = (code: number, stderr: string) => void;

export interface ServerDeps {
	/** Build (not start) the agent client; `onExit` fires once when the omp child dies. */
	createRpc(onExit: ExitListener): RpcClient;
	dataRoutes: Record<string, DataHandler>;
}

interface Socket {
	bridge: Bridge | null;
	/** Resolves once the agent is ready (or failed); commands wait on it. */
	ready: Promise<void> | null;
	closed: boolean;
	exited: boolean;
}

/**
 * RpcClient has no exit hook, so spawn the child ourselves (same argv/env as
 * RpcClient's default spawn) and watch `exited`.
 */
export function createRpc(config: ResearchConfig, onExit: ExitListener): RpcClient {
	return new RpcClient({
		args: ["--append-system-prompt", config.systemPrompt],
		spawn: agentArgs => {
			const child = ptree.spawn([...config.ompCommand, ...agentArgs], {
				cwd: config.home,
				env: Bun.env,
				stdin: "pipe",
			});
			child.exited.then(
				code => onExit(code, child.peekStderr()),
				() => onExit(-1, child.peekStderr()),
			);
			return child;
		},
	});
}

export async function startServer(config: ResearchConfig, deps: ServerDeps): Promise<Bun.Server<Socket>> {
	// Assigned right after bind; handlers only run after that.
	let port = 0;
	const api: Record<string, (req: Bun.BunRequest) => Response | Promise<Response>> = {};
	for (const [pattern, handler] of Object.entries(deps.dataRoutes)) {
		api[pattern] = req => checkRequest(req, port) ?? handler(req);
	}

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: config.port,
		// Production bundling by default: Bun's HMR dev bundler fails to resolve
		// collab-web's `@oh-my-pi/pi-utils/*` wildcard export (`bun build` resolves it).
		development: Bun.env.RESEARCH_WEB_DEV === "1",
		// ponytail: "/" (the HTML bundle and its assets) cannot be wrapped, so it is
		// served unguarded; it is static and carries no data. /ws and /api are guarded,
		// so a rebinding page can load the shell but never reach the agent or data.
		routes: { "/": index, ...api },
		fetch(req, server) {
			const denied = checkRequest(req, port);
			if (denied) return denied;
			if (new URL(req.url).pathname !== "/ws") return new Response("Not Found", { status: 404 });
			const data: Socket = { bridge: null, ready: null, closed: false, exited: false };
			if (server.upgrade(req, { data })) return undefined;
			return new Response("WebSocket upgrade required", { status: 426 });
		},
		websocket: {
			data: {} as Socket,
			open(ws) {
				const send = (frame: BridgeFrame) => {
					if (!ws.data.closed) ws.send(JSON.stringify(frame));
				};
				const exit = (code: number, stderr: string) => {
					if (ws.data.exited) return;
					ws.data.exited = true;
					send({ t: "exit", code, stderr });
				};
				// A child that dies during startup is reported by start()'s rejection,
				// which carries the real reason (stderr, bad stdout); hold the watcher's
				// exit until start() settles. Spawn failures (omp not found) never reach the watcher.
				let started = false;
				let early: [number, string] | null = null;
				const rpc = deps.createRpc((code, stderr) => {
					if (started) exit(code, stderr);
					else early = [code, stderr];
				});
				ws.data.bridge = new Bridge(rpc, send);
				ws.data.ready = rpc.start().then(
					() => {
						started = true;
						if (early) exit(...early);
					},
					(error: unknown) => exit(-1, error instanceof Error ? error.message : String(error)),
				);
			},
			async message(ws, message) {
				await ws.data.ready;
				await ws.data.bridge?.handle(typeof message === "string" ? message : message.toString());
			},
			async close(ws) {
				ws.data.closed = true;
				await ws.data.bridge?.dispose();
			},
		},
	});
	port = server.port ?? config.port;
	return server;
}

if (import.meta.main) {
	const config = loadConfig(Bun.env);
	const server = await startServer(config, {
		createRpc: onExit => createRpc(config, onExit),
		dataRoutes: dataRoutes(config),
	});
	const url = `http://127.0.0.1:${server.port}/`;
	console.log(`research web: ${url}`);
	if (config.openBrowser) {
		try {
			Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], { stdout: "ignore", stderr: "ignore" });
		} catch {
			// No opener available; the printed URL is enough.
		}
	}
}
