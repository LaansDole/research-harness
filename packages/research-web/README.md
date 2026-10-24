# @oh-my-pi/research-web

Local browser UI for the research harness — chat with the research agent and browse its artifacts without the TUI.

```sh
research web                     # starts on 127.0.0.1 (random port) and opens the browser
RESEARCH_WEB_PORT=7788 research web
RESEARCH_WEB_NO_OPEN=1 research web
```

Requires `bun` and the repo's `node_modules` (run from the checkout, like the dev `omp` wrapper).

## What you get

- **Header**: the project you are viewing next to the project the agent works on (slash commands target the latter), a one-click "Make active" prefill, agent status (Connecting / Ready / Working / Disconnected) and the current model. The view and project live in the URL (`#records/<slug>`), so reloads and links keep your place.
- **Chat**: streaming transcript and tool cards (collab-web renderers); an empty chat offers starter commands picked from the agent project's progress. The composer grows with the text, takes pasted or dropped images, stops a turn with Esc, and lets you restore the draft a prefill replaced.
- **Sidebar**: projects with screening progress, sessions (resume, new, fork), and a "Model & appearance" section (model, thinking level, light / dark / match my computer). ⌘/Ctrl+B collapses it; below 900 px it becomes a drawer.
- **Reading list**: `review.db` records with state chips and counts, search by title/author/DOI, and keyboard triage (↑/↓, Enter opens the record, Esc closes). The record panel shows the abstract, both screening verdicts with their rationale, DOI and PDF links, and the next action for that record; on phones it opens as a full-screen sheet with Prev/Next.
- **Reviews**: `review-*.md` rendered with a contents list, `[n]` citations that preview on hover and jump to the reference (browser Back returns), linked DOIs, per-section Revise and Check, and a Check-claim action on selected text.
- **Graph**: the `paper_graph.py` interactive graph; click or search a paper (Enter selects the top hit) for agent actions. Labels show for the focused paper and its neighbours.
- **PRISMA**: the `prisma_scr.py` SVG with Fit / 100 % (when it doesn't fit) and SVG download.
- **Empty states** say what to do next, with a button that prefills it.

Research views are read-only: their action buttons only **prefill** the chat composer, and nothing runs until you press send, so the agent remains the only writer of research state. Views refresh after every agent turn. The sidebar's session controls (resume, new, fork) and model / thinking pickers act immediately; they change the agent's session, not research state.

## How it works

`src/server.ts` (Bun.serve, 127.0.0.1) spawns one `omp --mode rpc --append-system-prompt research/mode/system.md` per browser tab through `RpcClient` and bridges it over `/ws` (`src/bridge.ts`, allowlisted commands, `src/protocol.ts`). `src/data.ts` serves read-only `/api/*` over `~/.research-harness`. `src/guard.ts` rejects foreign `Host` (DNS rebinding) and foreign `Origin` WebSocket/non-GET requests. No upstream package is modified.

| Env | Default |
|---|---|
| `RESEARCH_WEB_OMP` | set by `bin/research` (same omp the TUI uses) |
| `RESEARCH_SYSTEM_PROMPT` | set by `bin/research` |
| `RESEARCH_WEB_PORT` | `0` (random) |
| `RESEARCH_WEB_NO_OPEN` | unset |
| `RESEARCH_WEB_DEV` | unset; `1` enables Bun's HMR dev bundler (currently fails to resolve collab-web's `@oh-my-pi/pi-utils/*` imports) |

## Known limitations

- An omp extension that writes to stdout in RPC mode corrupts the JSONL stream and the UI shows "The research agent stopped unexpectedly". Example: `pi-warp` 1.0.1 `console.log`s on `session_start`; disable it (`omp plugin disable pi-warp`) to use the web UI.
- The UI shows plain-language errors only; technical detail (stderr, exit codes, stacks) goes to `~/.omp/logs/omp.YYYY-MM-DD.log` under `research-web:`.
- Reloading the page starts a fresh agent process (new session); resume earlier ones from the sidebar.

## Development

```sh
bun test            # guard, bridge allowlist, data API validation, chat reducer
bun run check       # oxlint + oxfmt + both tsconfigs
```
