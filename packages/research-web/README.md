# @oh-my-pi/research-web

Local browser UI for the research harness — chat with the research agent and browse its artifacts without the TUI.

```sh
research web                     # starts on 127.0.0.1 (random port) and opens the browser
RESEARCH_WEB_PORT=7788 research web
RESEARCH_WEB_NO_OPEN=1 research web
```

Requires `bun` and the repo's `node_modules` (run from the checkout, like the dev `omp` wrapper).

One unedited 5½-minute take of the whole UI — a researcher screening her own papers, in real time — is committed at [`assets/research/research-web.mp4`](../../assets/research/research-web.mp4) with chapter marks in [`research-web-chapters.json`](../../assets/research/research-web-chapters.json). [`assets/research/tapes/research-web.ts`](../../assets/research/tapes/research-web.ts) is the Puppeteer tape that records it against a scratch `~/.research-harness`.

## What you get

- **Header**: the project you are viewing next to the project the agent works on (slash commands target the latter), a one-click "Make active" prefill and agent status (Connecting / Ready / Working / Disconnected). The view and project live in the URL (`#records/<slug>`), so reloads and links keep your place.
- **PRISMA strip**: the five PRISMA-ScR counts under the header — Identified, Screened, Sought, Assessed, Included — each with what that stage still owes you (`4 to screen`, `2 to retrieve`). Click a box to open the reading list filtered to that stage; the box you are filtered to stays marked. On phones it collapses to one line of the three counts that matter.
- **Chat**: streaming transcript (collab-web renderers); each agent turn is one row, with its thinking and tool calls folded under a "thinking · N steps" disclosure so the answer stays in front. An empty chat offers starter actions picked from the agent project's progress.
- **Composer**: a raised card under the chat with the model and thinking-level pickers next to Send. It grows with the text, takes pasted or dropped images, stops a turn with Esc, and lets you restore the draft a prefill replaced.
- **Sidebar**: projects with screening progress and sessions (resume, new, fork). ⌘/Ctrl+B collapses it; below 900 px it becomes a drawer.
- **Light / dark**: the sun/moon button at the right of the top bar. Light by default; the choice is saved in `~/.research-harness/web-theme`.
- **Reading list**: `review.db` records with stage chips and counts, search by title/author/DOI, and keyboard triage (↑/↓, Enter opens the record, Esc closes). The record panel shows the abstract, both screening verdicts with their rationale, DOI and PDF links, and the next action for that record; on phones it opens as a full-screen sheet with Prev/Next.
- **Screening desk**: decide a paper yourself from the reading list — Include / Exclude / Maybe (`I`, `E`, `M`), the exclude reason picked from your project's own criteria, an optional note, then it advances to the next paper waiting on a decision. Where the agent has already screened a paper, its recorded verdict and confidence show above the buttons, to confirm or overrule. Verdicts are written by `review.py verdict` and tagged `[researcher]`.
- **Highlight words**: a per-project include and exclude word list (suggested from your `scope.md` in one click), marked in every title and abstract — green for include, vermilion underlined for exclude.
- **Reviews**: `review-*.md` rendered with a contents list, `[n]` citations that preview on hover and jump to the reference (browser Back returns), linked DOIs, per-section Revise and Check. Select a sentence and a margin note appears beside it with the quote and a Check-claim button, which prefills the request rather than sending it.
- **Graph**: the `paper_graph.py` interactive graph; click or search a paper (Enter selects the top hit) for agent actions. Labels show for the focused paper and its neighbours.
- **PRISMA**: the `prisma_scr.py` SVG with Fit / 100 % (when it doesn't fit) and SVG download.
- **Empty states** say what to do next, with a button that prefills it.

Research views are read-only with one exception: the reading list's screening desk records a verdict by shelling out to `review.py verdict`, exactly as the agent and Jev do. Every other action button only **prefills** the chat composer, and nothing runs until you press send. Views refresh after every agent turn. The sidebar's session controls (resume, new, fork) and model / thinking pickers act immediately; they change the agent's session, not research state.

## How it works

`src/server.ts` (Bun.serve, 127.0.0.1) spawns one `omp --mode rpc --append-system-prompt research/mode/system.md` per browser tab through `RpcClient` and bridges it over `/ws` (`src/bridge.ts`, allowlisted commands, `src/protocol.ts`). `src/data.ts` serves `/api/*` over `~/.research-harness`: reads everywhere, plus the screening verdict route (which spawns `review.py`) and the highlight-word list. `src/guard.ts` rejects foreign `Host` (DNS rebinding) and foreign `Origin` WebSocket/non-GET requests. No upstream package is modified.

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
