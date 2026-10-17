# Research Web UI — design

Status: approved (all recommended options accepted, 2026-10-17).

## Goal

Give researchers a browser UI for the research harness so they never need the TUI: chat with the agent (parity with the TUI's core loop), manage sessions/models, and browse the research artifacts the harness already writes (paper graph, reviews, reading list, PDFs, PRISMA) with buttons that hand actions back to the agent.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Deployment | Local only: each researcher runs it on their own laptop, bound to `127.0.0.1`, no accounts | Single user, no multi-tenant isolation needed |
| Agent transport | Server spawns `omp --mode rpc` via `RpcClient` (`packages/coding-agent/src/modes/rpc/rpc-client.ts`) and bridges over one WebSocket per browser tab | Published RPC contract; zero upstream edits |
| Location | New package `packages/research-web/`; launcher `research web` in `bin/research` | Upstream has no such path → weekly `fork-sync.yml` merges never conflict |
| Upstream files | No edits to `packages/coding-agent`, `packages/collab-web`, or any other upstream-owned file | Every changed upstream line is a recurring sync conflict |
| Reuse | collab-web `Transcript`, `Markdown`, `tool-render/`; coding-agent `listSessionsReadOnly`/`sessionDisplayName`; python `graph_viz.py`, `prisma_scr.py` | One implementation per concern |
| Research views | Read-only, plus "send to agent" buttons that **prefill** the chat composer and switch to Chat; the researcher presses send | Agent stays the single writer of `review.db`/`papers.db`/`active-project`; nothing runs unseen |
| Frontend serving | Bun fullstack server (`Bun.serve({ routes: { "/": indexHtml } })` with an HTML import) | Runs from the repo checkout like the dev omp wrapper; no build step or embedded archive |
| Graph view | `graph_viz.py` HTML in an iframe; node click `postMessage`s to the parent | One layout implementation; accepted cost: graph keeps its own dark styling |

## Architecture

```
Browser SPA ──WebSocket /ws──▶ research-web server (Bun.serve, 127.0.0.1)
            ──HTTP /api/*───▶   ├─ bridge: RpcClient ─stdio JSONL─▶ omp --mode rpc --append-system-prompt research/mode/system.md
                                └─ data: read-only bun:sqlite + fs + python scripts
                                        papers.db, projects/<slug>/{review.db, review-*.md, papers/*.pdf}, active-project
```

### Launch

`research web` (new case in `bin/research`, after config/env setup):
- Requires `bun` and the repo's `node_modules`; otherwise exit 1 with a message.
- Exports `RESEARCH_WEB_OMP` (the same omp binary the TUI path resolves: `RESEARCH_HARNESS_OMP` → dev wrapper → `omp`) and `RESEARCH_SYSTEM_PROMPT` (path to `research/mode/system.md`), then `exec bun packages/research-web/src/server.ts`.
- The server listens on `127.0.0.1`, port `RESEARCH_WEB_PORT` (default `0` = random free port), prints `research web: <url>`, and opens the browser (`open` on darwin, `xdg-open` elsewhere) unless `RESEARCH_WEB_NO_OPEN=1`.

### Server environment

| Var | Default | Use |
|---|---|---|
| `RESEARCH_WEB_OMP` | `omp` | argv prefix for `RpcClient({ command })` |
| `RESEARCH_SYSTEM_PROMPT` | `$RESEARCH_HARNESS_HOME/research/mode/system.md` | passed as `--append-system-prompt` |
| `RESEARCH_HARNESS_HOME` | repo root (two dirs above the package) | locates python scripts |
| `PAPER_GRAPH_DB` | `~/.research-harness/papers.db` | graph data |
| `RESEARCH_CORPUS_DIR` | unset | second allowed PDF root |
| `RESEARCH_WEB_PORT`, `RESEARCH_WEB_NO_OPEN` | `0`, unset | listen port / suppress browser open |

Research state home is fixed at `~/.research-harness` (same as the python scripts). Agent cwd = that directory (matches the launcher's behavior when started from `~`).

### Security (trust boundary)

Any web page the researcher visits can send requests to `127.0.0.1`. The WebSocket drives an agent with shell access, so:
- Reject every request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>` (blocks DNS rebinding).
- Reject the WebSocket upgrade and every non-GET `/api` request whose `Origin` is present and differs from the server origin (blocks cross-site WebSocket hijacking).
- No CORS headers anywhere.
- All path inputs validated (see Data API).

### Agent bridge (WebSocket `/ws`)

One `RpcClient` per WebSocket connection, started on open, `stop()`ped on close. Options: `command: [RESEARCH_WEB_OMP]`, `args: ["--append-system-prompt", RESEARCH_SYSTEM_PROMPT]`, `cwd: ~/.research-harness`, `env: process.env`.

Frames are JSON text.

Client → server: `{ id: number, cmd, ...params }` where `cmd` is one of (allowlist; anything else replies `ok:false`):

| cmd | params | RpcClient call |
|---|---|---|
| `prompt` | `message: string`, `images?: ImageContent[]` | `prompt(message, images)` (uses `streamingBehavior: "followUp"` while the agent is working) |
| `abort` | — | `abort()` |
| `new_session` | — | `newSession()` |
| `switch_session` | `path: string` | `switchSession(path)` — path must be in the current `list_sessions` result |
| `fork` | `entryId?: string` | `fork(entryId)` |
| `get_state` | — | `getState()` |
| `get_messages` | — | `getMessages()` |
| `get_available_models` | — | `getAvailableModels()` |
| `set_model` | `provider`, `modelId` | `setModel(provider, modelId)` |
| `set_thinking_level` | `level` | `setThinkingLevel(level)` |
| `list_sessions` | — | `listSessionsReadOnly(dirname(state.sessionFile), new FileSessionStorage())` → `{ path, id, title: sessionDisplayName(info), modified }[]`, newest first, empties dropped via `isEmptySession` |

Server → client:
- `{ t: "reply", id, ok: true, data }` / `{ t: "reply", id, ok: false, error: string }`
- `{ t: "event", event }` — every `onEvent` agent event
- `{ t: "settled" }` — `onSessionSettled`; the UI uses it to refresh research views
- `{ t: "exit", code, stderr }` — the omp child died; UI shows a banner with a reconnect button

### Data API (read-only)

`slug` must match `^[\w.-]+$`, must not be `.`/`..`, and `~/.research-harness/projects/<slug>` must be a directory → else 400/404. All SQLite opens use `{ readonly: true }`; a missing `review.db` yields empty results, not an error.

| Route | Response |
|---|---|
| `GET /api/projects` | `{ slug, active, counts: Record<state, number> }[]`; `active` from `~/.research-harness/active-project` |
| `GET /api/projects/:slug/reviews` | `{ file, mtime }[]` for `review-*.md`, newest first |
| `GET /api/projects/:slug/reviews/:file` | `text/markdown`; `file` must match `^review-[\w.-]+\.md$` |
| `GET /api/projects/:slug/records?state=<state>` | records rows: `id, title, authors, year, venue, doi, url, state, ta_verdict, ta_rationale, ft_verdict, ft_rationale, exclusion_reason, oa_status, has_pdf`; `state` optional, must be one of the nine `review.py` states |
| `GET /api/projects/:slug/pdf/:recordId` | `application/pdf`; `records.pdf_path` is `realpath`ed and must lie inside the project dir's realpath or `RESEARCH_CORPUS_DIR`'s realpath → else 403 |
| `GET /api/projects/:slug/prisma.svg` | `python3 prisma_scr.py --project <slug> --format svg` stdout; exit ≠ 0 → 404 with stderr |
| `GET /api/graph` | `{ mtime }` of `PAPER_GRAPH_DB` (0 when missing) |
| `GET /api/graph.html` | `python3 graph_viz.py --db <PAPER_GRAPH_DB> --out <tmp>` then the file; served `text/html` |

### Frontend

- Layout: left sidebar (project picker with screening progress; session list with "New session"; model + thinking picker), main area with tabs **Chat · Graph · Reviews · Reading list · PRISMA**.
- Chat: collab-web `Transcript` fed by a local reducer over bridge events (same event semantics as collab-web's `GuestClient#applyEvent`: `message_*` drive the stream, `tool_execution_*` drive active tools, `agent_start/end` drive `working`; completed messages append `MessageEntry`s). Initial history from `get_messages`. Own composer: Enter sends, Shift+Enter newline, Stop button while working, image attach (paste/file → base64 `ImageContent`).
- Prefill: a shared `prefill(text)` sets the composer draft and switches to Chat.
- Views refresh on `settled`. The graph iframe reloads only when `/api/graph` `mtime` changed.

| View | "Send to agent" prefills |
|---|---|
| Graph (on `paper-graph:select` message) | `Find papers that cite "<title>" and add them to the graph`, `Run auto-edges for paper <id>`, `Explain how "<title>" relates to its neighbors in the graph` |
| Reviews (per `##` heading) | `Revise the section "<heading>" in <file>` ; per selected text: `Check this claim against the cited papers: "<selection>"` |
| Reading list (per row) | `Screen record <id> ("<title>")`, `Retry full-text retrieval for record <id>`, `Explain why record <id> was excluded` |
| Project picker | `Switch the active project to <slug>` |

Review markdown renders via collab-web `Markdown`; `[n]` citations become links that scroll to the n-th entry of the review's reference list.

`graph_viz.py` change (research-owned file): in `showPanel(n)`, when embedded (`window.parent !== window`), `window.parent.postMessage({ type: "paper-graph:select", id: n.id, title: n.title }, "*")`. The parent ignores messages whose `source` is not its graph iframe.

## Error handling

- omp child exit → `exit` frame → banner + reconnect (new WebSocket = new child).
- Bridge command failure → `reply ok:false` → toast with the message.
- Data API → JSON `{ error }` with 400/403/404/500; views render the error inline.
- Python script missing/failing → 404/500 with stderr text; the view says so.

## Testing

Permanent tests (bun test, `packages/research-web/test/`), each guarding a consumer-visible failure:
- PDF route rejects `..`, absolute paths outside the roots, and symlinks escaping the roots; serves a PDF inside the project.
- Slug / review filename / state validation rejects traversal and unknown states.
- Host/Origin guard: foreign `Origin` WebSocket upgrade and foreign `Host` requests are rejected; same-origin passes.
- Chat reducer: a scripted event sequence (agent_start → message_update × n → tool_execution_start/end → message_end → agent_end) yields the expected entries/stream/activeTools/working without duplicating the final assistant message.
- Bridge allowlist: unknown `cmd` replies `ok:false` and never reaches `RpcClient`.

Smoke: `research web` against the real `~/.research-harness` (4 projects present), exercise chat round-trip, session switch, every view, a prefill button, and a PDF open in the browser.

## Out of scope (v1)

Editing from views, multiple simultaneous projects, live graph updates mid-turn, cross-project search, auth/multi-user, packaging into the compiled omp binary.
