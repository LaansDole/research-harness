# Research Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `research web` opens a local browser UI with agent chat, sessions/models, and read-only research views with prefill-to-chat actions.

**Architecture:** New `packages/research-web` Bun fullstack server on 127.0.0.1: a WebSocket bridge to `omp --mode rpc` via `RpcClient`, a read-only data API over `~/.research-harness`, and a React SPA reusing collab-web's transcript/markdown/tool renderers. Spec: `docs/superpowers/specs/2026-10-17-research-web-ui-design.md` (the contract — WS frames, routes, validation rules — is defined there and is authoritative).

**Tech Stack:** Bun 1.3 (`Bun.serve` routes + HTML import, `bun:sqlite`), React 19, `@oh-my-pi/collab-web` (source imports), `@oh-my-pi/pi-coding-agent` (`RpcClient`, session listing), python3 research scripts.

## Global Constraints

- NO edits to upstream-owned files (`packages/coding-agent`, `packages/collab-web`, `packages/wire`, …). Only new files under `packages/research-web/`, plus `bin/research`, `research/skills/paper-graph/scripts/graph_viz.py`, docs.
- Bind `127.0.0.1` only; Host + Origin guard per spec "Security".
- All SQLite opens `{ readonly: true }`; the UI never writes research state.
- Repo rules (AGENTS.md): no `any`, no `ReturnType<>`, no inline imports, `#private` fields, `Promise.withResolvers()`, `Bun.file`/`Bun.write`, namespace imports for `node:fs`/`node:path`/`node:os`, tabs (oxfmt), no `console.*` in shared code except the standalone server entry's startup line.
- Tests: `bun test` in `packages/research-web`; only the contracts listed in spec "Testing". Never `mock.module()`.
- No git commits (repo rule: never commit unless asked).

---

### Task 1: Package skeleton, server, security guard, bridge, launcher

**Files:**
- Create: `packages/research-web/package.json`, `tsconfig.json`, `README.md`, `CHANGELOG.md`
- Create: `packages/research-web/src/server.ts` (entry), `src/config.ts`, `src/guard.ts`, `src/bridge.ts`, `src/protocol.ts`
- Modify: `bin/research` (add `web` case)
- Test: `packages/research-web/test/guard.test.ts`, `test/bridge.test.ts`

**Interfaces (produces):**
- `src/protocol.ts`: `type BridgeCommand` (union of the spec's allowlisted `{ id: number; cmd: ...; ...params }`), `type BridgeFrame = { t: "reply"; id: number; ok: true; data: unknown } | { t: "reply"; id: number; ok: false; error: string } | { t: "event"; event: AgentSessionEvent | AgentEvent } | { t: "settled" } | { t: "exit"; code: number; stderr: string }`, `interface SessionListItem { path: string; id: string; title: string; modified: string }`. Pure types; imported by the client too (no runtime deps).
- `src/config.ts`: `interface ResearchConfig { home: string; projectsDir: string; papersDb: string; harnessHome: string; corpusDir?: string; ompCommand: string[]; systemPrompt: string; port: number; openBrowser: boolean }`, `function loadConfig(env: Record<string, string | undefined>): ResearchConfig`.
- `src/guard.ts`: `function checkRequest(req: Request, port: number): Response | null` — returns a 403 Response when Host is not `127.0.0.1:<port>`/`localhost:<port>`, or when (WebSocket upgrade or non-GET) and `Origin` is present and not `http://127.0.0.1:<port>`/`http://localhost:<port>`; else `null`.
- `src/bridge.ts`: `class Bridge { constructor(rpc: BridgeRpc, send: (f: BridgeFrame) => void); handle(raw: string): Promise<void>; dispose(): Promise<void> }` where `type BridgeRpc = Pick<RpcClient, "prompt" | "abort" | "newSession" | "switchSession" | "fork" | "getState" | "getMessages" | "getAvailableModels" | "setModel" | "setThinkingLevel" | "onEvent" | "onSessionSettled" | "stop">`. `list_sessions` uses `listSessionsReadOnly` + `FileSessionStorage` + `sessionDisplayName` + `isEmptySession` from `@oh-my-pi/pi-coding-agent/session/session-listing` (verify exact export paths of `FileSessionStorage` with grep). `switch_session` rejects paths not in the last `list_sessions` result. Track `working` from `agent_start`/`agent_end` events to choose `streamingBehavior: "followUp"`.
- `src/server.ts`: `export async function startServer(config: ResearchConfig, deps: { createRpc(): RpcClient; dataRoutes: Record<string, RouteHandler> }): Promise<Bun.Server>`; the `import.meta.main` block loads config, starts, prints `research web: <url>`, opens browser. `/` route = `import index from "./client/index.html"` (Task 3 creates it; create a minimal placeholder index.html only if Task 3's is absent, then Task 3 overwrites). `/ws` upgrades after `checkRequest`; each socket gets `new RpcClient({ command: config.ompCommand, args: ["--append-system-prompt", config.systemPrompt], cwd: config.home, env })`, `await start()`, wires `onEvent`/`onSessionSettled`, and on child exit sends `exit` (detect via `start()` rejection or a failed command whose error indicates the process exited; read `RpcClient` for an exit hook before inventing one). Data routes from Task 2 are mounted under `/api` via `deps.dataRoutes`, every request passes `checkRequest` first.
- `bin/research`: move OMP_BIN resolution above the `case`; add `web)` that checks `bun` + `$RESEARCH_HARNESS_HOME/node_modules`, exports `RESEARCH_WEB_OMP="$OMP_BIN"` and `RESEARCH_SYSTEM_PROMPT="$SYSTEM_PROMPT"`, then `exec bun "$RESEARCH_HARNESS_HOME/packages/research-web/src/server.ts"`. Update the `# Usage:` comment.

- [ ] Write `test/guard.test.ts`: foreign Host → 403; WS upgrade with `Origin: https://evil.example` → 403; same-origin WS → null; GET without Origin → null.
- [ ] Write `test/bridge.test.ts`: fake `BridgeRpc` recording calls; `{"id":1,"cmd":"rm_rf"}` → reply ok:false and no rpc call; `prompt` while working → `streamingBehavior "followUp"`; `switch_session` to unlisted path → ok:false.
- [ ] Run `bun test` in `packages/research-web` → FAIL, implement, → PASS.
- [ ] `bun install` at repo root so the workspace links.

### Task 2: Read-only data API + graph_viz postMessage

**Files:**
- Create: `packages/research-web/src/data.ts`
- Modify: `research/skills/paper-graph/scripts/graph_viz.py` (`showPanel`)
- Test: `packages/research-web/test/data.test.ts`

**Interfaces (produces):** `function dataRoutes(config: ResearchConfig): Record<string, (req: Bun.BunRequest) => Response | Promise<Response>>` keyed by Bun route patterns: `/api/projects`, `/api/projects/:slug/reviews`, `/api/projects/:slug/reviews/:file`, `/api/projects/:slug/records`, `/api/projects/:slug/pdf/:recordId`, `/api/projects/:slug/prisma.svg`, `/api/graph`, `/api/graph.html`. Response shapes, validation and status codes exactly per spec "Data API". Also export the shared row types `ProjectSummary`, `ReviewFile`, `RecordRow` for the client. Review states list = the nine from `research/skills/literature-search/scripts/review.py:31-41` (read them). Python via `Bun.spawn(["python3", script, ...])` with `cwd` unset, scripts at `${harnessHome}/research/skills/...`; prisma passes `--project <slug>` and needs `HOME` unchanged.

- [ ] Write `test/data.test.ts` using a temp `home` (`fs.mkdtemp`), a project with a real `review.db` created via `bun:sqlite` with the `records` schema from ARCHITECTURE §4.2: PDF inside project → 200 `application/pdf`; `pdf_path` = `../../etc/passwd`-style and absolute outside → 403; symlink inside project pointing outside → 403; slug `..` → 400; reviews file `../x.md` → 400; `records?state=bogus` → 400; `records?state=included` filters.
- [ ] Run → FAIL, implement, → PASS.
- [ ] graph_viz.py: in `showPanel(n)` add `if (window.parent !== window) window.parent.postMessage({type: "paper-graph:select", id: n.id, title: n.title}, "*");`. Run `research/tests/run.sh` (or `python3 -m unittest discover research/tests`) → still green.

### Task 3: React client

**Files:**
- Create: `packages/research-web/src/client/index.html`, `main.tsx`, `App.tsx`, `app.css`, `api.ts` (fetch helpers), `agent.ts` (WebSocket client + reducer), `Composer.tsx`, `Sidebar.tsx`, `views/GraphView.tsx`, `views/ReviewsView.tsx`, `views/RecordsView.tsx`, `views/PrismaView.tsx`
- Test: `packages/research-web/test/reducer.test.ts`

**Interfaces:**
- Consumes: `BridgeCommand`/`BridgeFrame`/`SessionListItem` from `src/protocol.ts`; `ProjectSummary`/`ReviewFile`/`RecordRow` from `src/data.ts` (type-only imports); collab-web `Transcript` (`@oh-my-pi/collab-web/src/components/transcript/Transcript`), `Markdown` (`.../transcript/Markdown`), and its CSS/theme (`src/styles`, `lib/theme.ts`) — read collab-web `src/app.tsx` + `src/lib/client.ts` to mirror how it feeds `Transcript`.
- Produces: `agent.ts`: `interface ChatState { entries: SessionEntry[]; stream: AssistantMessage | null; streamDone: boolean; activeTools: ReadonlyMap<string, ActiveTool>; working: boolean }`, `function reduce(state: ChatState, event: AgentEvent): ChatState` (pure), `function entriesFromMessages(messages: AgentMessage[]): SessionEntry[]`, `class AgentConnection` (WebSocket, request/reply by id with `Promise.withResolvers()`, `subscribe`, `onSettled`, `onExit`).
- Reducer semantics: mirror `GuestClient#applyEvent` (collab-web `src/lib/client.ts:444-500`); on `message_end` append a `MessageEntry` (synthesize `id`/`parentId`/`timestamp`) for user, assistant and toolResult messages, and clear `stream` when the assistant message is appended so it never renders twice. Verify against `Transcript` how `stream` + entries interact.
- UI per spec "Frontend": sidebar (projects with progress = included+excluded over non-duplicate total, sessions, New session, model + thinking select), tabs Chat/Graph/Reviews/Reading list/PRISMA, `prefill(text)` → composer draft + Chat tab, exit banner with Reconnect, toasts for `ok:false`. Views re-fetch on `settled`; graph iframe `src="/api/graph.html?v=<mtime>"` changes only when mtime changed; listens to `message` events whose `source === iframe.contentWindow` and `data.type === "paper-graph:select"`. Reviews: `Markdown`, `[n]` → anchor to n-th list item under the last heading matching /references|bibliography/i (add ids after render), per-`##` "Revise" buttons, selection → "Check claim" button. Records: table with state filter select, PDF link `target="_blank"` when `has_pdf`, row buttons.
- Composer: Enter sends, Shift+Enter newline, IME-safe (copy the `isComposing` check idea), Stop while working, paste/file images → base64 `ImageContent`.

- [ ] Write `test/reducer.test.ts`: scripted sequence agent_start → message_start(user)/message_end(user) → message_update(assistant)×2 → tool_execution_start → tool_execution_end → message_end(assistant) → agent_end: entries = [user, assistant], stream null, activeTools empty, working false; mid-sequence snapshot has `working` true and the tool active.
- [ ] Run → FAIL, implement, → PASS.

### Task 4: Integration, docs, smoke

- [ ] `bun check` scoped: `cd packages/research-web && bun run check && bun run check:types` (add those scripts mirroring `packages/stats`).
- [ ] Smoke: `RESEARCH_WEB_NO_OPEN=1 research web`, open the URL in a browser tab: chat round-trip with a tool call, session list + switch, model picker, each view against real `~/.research-harness` data, one prefill per view, open a PDF, foreign-Origin WS rejected (curl).
- [ ] Docs: `docs/ARCHITECTURE.md` component table rows for `packages/research-web` and `research web`; `packages/research-web/README.md`; `CHANGELOG.md` `## [Unreleased]` → `### Added`.
