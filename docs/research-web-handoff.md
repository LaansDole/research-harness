# research-web handoff

**State (2026-10-17):** branch `feat/research-web-ui`. All follow-ups below, including the readable-errors work, are committed on top of `40b0b59556` and pushed to PR #7. Untracked `.pi/` (casefile DB) is unrelated, so never stage it. 18 older untracked `docs/superpowers/{plans,specs}/2026-09-*` and `*fork-rebase-stack*` files also predate this work and are not part of it.

## Repo / PR

| Path | Branch | HEAD | Sync | PR |
|---|---|---|---|---|
| `/Users/laansdole/Projects/research-harness` (main checkout, no worktree) | `feat/research-web-ui` | `40b0b59556` | synced, dirty | [LaansDole/research-harness#7](https://github.com/LaansDole/research-harness/pull/7) OPEN, head `40b0b59556` |

PRs go to the **fork** (`LaansDole/research-harness`, base `main`), never upstream `can1357/oh-my-pi`. `gh` defaults to the parent repo, so always pass `--repo LaansDole/research-harness`. The user waived the CONTRIBUTING "own words" sentence for the fork.

## Running processes

| What | How started | Notes |
|---|---|---|
| research web server on `http://127.0.0.1:7788/` | `RESEARCH_WEB_NO_OPEN=1 RESEARCH_WEB_PORT=7788 research web`, detached | Bundle is built at startup; restarted after the theme setting, so it serves current code. Restart again after any client change. |

Environment changes made for the user:
- `omp plugin disable pi-warp`. pi-warp 1.0.1 `console.log`s to stdout in RPC mode and breaks chat. The user runs Ghostty, where pi-warp is a no-op. Re-enable with `omp plugin enable pi-warp`.
- Demo data: project `~/.research-harness/projects/demo-web-ui` (14 real OpenAlex records, verdicts, 4 OA PDFs, `review-multi-agent-cds.md`), plus 8 papers / 7 edges added to the global `~/.research-harness/papers.db` (ids: cogbias korean-triage galatea2 care-ad triageagent galen medagents agentclinic). Removal commands are in the PR thread / below.

## What changed

Committed (`40b0b59556 research: add local web UI (research web)`): new `packages/research-web` (Bun server on 127.0.0.1, WebSocket bridge to `omp --mode rpc` via `RpcClient`, read-only `/api` over `~/.research-harness`, React SPA reusing collab-web renderers), the `research web` case in `bin/research`, a `graph_viz.py` postMessage hook, and the ARCHITECTURE row. Spec: `docs/superpowers/specs/2026-10-17-research-web-ui-design.md`. Plan: `docs/superpowers/plans/2026-10-17-research-web-ui.md`.

Uncommitted follow-ups (all verified green, see below):

| Change | Files | Why |
|---|---|---|
| Prefills name the project | `src/client/views/RecordsView.tsx`, `ReviewsView.tsx` | Without it, the agent resolved records against the *active* project |
| `has_pdf` true only if the file exists | `src/data.ts` (records route), `test/data.test.ts` (`stale pdf_path …`) | Stale `pdf_path` showed a dead "open" link |
| Row actions gated by state | `RecordsView.tsx` (`NEEDS_FULLTEXT`) | Retry PDF / Screen / Why excluded only where meaningful |
| Prefill focuses the composer | `src/client/App.tsx` (`prefill`) | Enter now sends the reviewed prompt |
| Researcher-readable errors | `src/data.ts`, `src/bridge.ts`, `src/server.ts`, `src/protocol.ts`, `src/client/{agent,api}.ts`, `App.tsx`, views, `app.css`, tests | User request: the UI must never show code/stack/stderr text |

Error handling:
- `data.ts`: every `HttpError` message rewritten in plain language. A non-`HttpError` failure is logged via `logger` and shown as a generic message. `scriptFailed()` logs python stderr and surfaces a sentence. PRISMA checks for `review.db` first and returns an empty-state sentence ("No screening records in this project yet. Ask the agent to find or import papers…"), which fixes the user's reported `prisma_scr: no review.db …` text. Browser navigations (`Accept: text/html`, e.g. PDF links in a new tab) get a small HTML page instead of JSON.
- `bridge.ts`: a failed command replies "Couldn't <action>. Try again; …" (`ACTION_BY_CMD`); unknown commands reply "That action isn't supported."; the technical error is logged (action name only, no prompt text).
- Exit path: `protocol.ts` `exit` frame no longer carries code/stderr. `server.ts` logs them. `agent.ts` `ExitInfo` is `{ reason: "agent" | "connection" }`. The `App.tsx` banner shows a sentence per reason.

Client side: `api.ts` never shows a non-JSON body ("Couldn't load this. Try again."), and an unreachable server gives "Can't reach research web. Is it still running?". `Loaded.empty` (404) selects the neutral `.rw-notice` via `problemClass()`; 5xx keeps the red `.rw-error`. Graph/Reviews empty states no longer name files. `App.tsx:102` omp `notice` toasts left as-is (user-facing by design).

## Verification evidence

```
cd packages/research-web && bun test        22 pass, 0 fail
cd packages/research-web && bun run check   exit 0
```

Browser smoke (system Chrome via puppeteer-core; the harness `browser` tool hangs on :7788): PRISMA on `llm-agents-radiology-report-generation` shows the grey empty-state sentence; Reviews empty state likewise. Missing-PDF HTML page verified with curl. **Not verified:** the agent-stopped banner (kill the omp child).

Other open items (not started; decide with user):
- Kill the omp child under `research web` and confirm the "agent stopped" banner (only error path not seen in a browser).
- Harness bug: `research/skills/literature-search/scripts/fetch_paper.py` saves HTML landing pages (Zenodo) as `.pdf` and marks records `fulltext_retrieved`. Seen on `10.5281/zenodo.19828812` / `.21341928`. Fix: check the response is a PDF (content-type or `%PDF` magic) before saving/marking.
- `config.env` overrides an exported `PAPER_GRAPH_DB` in `bin/research` (pre-existing launcher behaviour).

## Commands

```sh
# test + lint + types
cd /Users/laansdole/Projects/research-harness/packages/research-web && bun test && bun run check

# restart the UI server (rebuilds the bundle)
lsof -ti :7788 | xargs kill; cd /Users/laansdole/Projects/research-harness && RESEARCH_WEB_PORT=7788 research web

# inspect server logs (technical errors now land here)
tail -f ~/.omp/logs/omp.$(date +%F).log | grep research-web

# PR
gh pr view 7 --repo LaansDole/research-harness

# remove demo data
rm -rf ~/.research-harness/projects/demo-web-ui
for id in cogbias korean-triage galatea2 care-ad triageagent galen medagents agentclinic; do
  python3 research/skills/paper-graph/scripts/paper_graph.py remove $id
done
```
