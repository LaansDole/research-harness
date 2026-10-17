# @oh-my-pi/research-web

Local browser UI for the research harness — chat with the research agent and browse its artifacts without the TUI.

```sh
research web                     # starts on 127.0.0.1 (random port) and opens the browser
RESEARCH_WEB_PORT=7788 research web
RESEARCH_WEB_NO_OPEN=1 research web
```

Requires `bun` and the repo's `node_modules` (run from the checkout, like the dev `omp` wrapper).

## What you get

- **Chat**: streaming transcript and tool cards (collab-web renderers), image attach, Stop, steering/follow-up while the agent works.
- **Sidebar**: projects with screening progress, sessions (resume, new, fork), model and thinking level.
- **Graph**: the `paper_graph.py` interactive graph; clicking a paper offers agent actions.
- **Reviews**: `review-*.md` rendered; `[n]` citations jump to the reference list; per-section Revise and selection Check-claim actions.
- **Reading list**: `review.db` records with verdicts and rationales, state filter, PDF open, per-record actions.
- **PRISMA**: the `prisma_scr.py` SVG.

Views are read-only. Action buttons only **prefill** the chat composer; nothing runs until you press send, so the agent remains the only writer of research state. Views refresh after every agent turn.

## How it works

`src/server.ts` (Bun.serve, 127.0.0.1) spawns one `omp --mode rpc --append-system-prompt research/mode/system.md` per browser tab through `RpcClient` and bridges it over `/ws` (`src/bridge.ts`, allowlisted commands, `src/protocol.ts`). `src/data.ts` serves read-only `/api/*` over `~/.research-harness`. `src/guard.ts` rejects foreign `Host` (DNS rebinding) and foreign `Origin` WebSocket/non-GET requests. No upstream package is modified. Design: `docs/superpowers/specs/2026-10-17-research-web-ui-design.md`.

| Env | Default |
|---|---|
| `RESEARCH_WEB_OMP` | set by `bin/research` (same omp the TUI uses) |
| `RESEARCH_SYSTEM_PROMPT` | set by `bin/research` |
| `RESEARCH_WEB_PORT` | `0` (random) |
| `RESEARCH_WEB_NO_OPEN` | unset |
| `RESEARCH_WEB_DEV` | unset; `1` enables Bun's HMR dev bundler (currently fails to resolve collab-web's `@oh-my-pi/pi-utils/*` imports) |

## Known limitations

- An omp extension that writes to stdout in RPC mode corrupts the JSONL stream and the UI shows "agent exited". Example: `pi-warp` 1.0.1 `console.log`s on `session_start`; disable it (`omp plugin disable pi-warp`) to use the web UI.
- Reloading the page starts a fresh agent process (new session); resume earlier ones from the sidebar.

## Development

```sh
bun test            # guard, bridge allowlist, data API validation, chat reducer
bun run check       # oxlint + oxfmt + both tsconfigs
```
