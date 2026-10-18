# Spec: Surface the research harness's capabilities in the TUI

Date: 2026-09-19. Status: locked (open questions resolved by live verification in Task 1).

## Problem

The harness has 13 slash commands but nothing visibly advertises them. A researcher opening `research` sees an empty prompt: no idea that `/scope`, `/screen`, `/prisma` exist or where to start. The testing runbook (docs/RUNBOOK.md) confirmed this as the top discoverability gap. User direction: "the research harness should visibly provide its capabilities ... you can include a /help in statusline or similar to make the harness more non-technical friendly."

## Verified platform facts (recon 2026-09-19, this repo)

- Prompt templates ARE surfaced in the `/` picker with their frontmatter `description` (packages/coding-agent/src/modes/interactive-mode.ts:1853-1883). Templates whose name collides with a command token are FILTERED OUT of the picker (reservedNames set, line 1859), and builtin command execution resolves before template expansion — so a `help.md` prompt template would be invisible AND dead. A real command requires the extension API.
- Plugins ship extensions: `"extensions": [...]` key in the omp (and pi) manifest (packages/coding-agent/src/extensibility/plugins/types.ts:15,40; loader.ts:297-305). Extension modules are TypeScript, load directly from source (peer types resolved by omp's runtime — no npm install, no tsc gate; proven by the omp-statusline build, 2026-08-30).
- Extension API: `registerCommand(name, options)` (extensions/loader.ts:223), `setStatus(key, text)` (extensions/types.ts:263).
- The TUI has a StatusLineComponent (interactive-mode.ts:1292) that renders setStatus values.
- OPEN QUESTION resolved by Task 1 (live probe): does an extension-registered `help` command shadow the builtin `help`? If yes, name ours `help`; if no, name it `guide` and make every hint say `/guide`.

## Design

Three pieces, all additive under `research/`, zero packages/ changes:

1. **`/help` (or `/guide`) — the research capability guide (extension command).**
   - New extension `research/extensions/research-mode/` (`index.ts` + bundled `help.md` asset imported with `{ type: "text" }` — repo rule: no prompt content in code).
   - Renders, researcher-voiced, no coding jargon:
     a. "Where to start" — 3 plain sentences (new review → /scope; have records → /import; quick pass → /litreview).
     b. The 13 commands as a table: command | what it does (plain words) | when you'd use it. Generated from the SAME source of truth as the `/` picker: the prompt files' frontmatter descriptions are the ground truth; the help asset carries the workflow order and the "when" column. The command list must be asserted against the 13 template files by a test so help and picker cannot drift.
     c. "You can also just type sentences" — one example ("screen the first 10 records against my criteria").
   - Command registration: the extension imports ONLY types from peer packages (runtime code uses the passed `api` object only), so pure helpers are unit-testable under `bun test` without omp's runtime.

2. **Statusline research hint (same extension, `setStatus`).**
   - Key `research`, content: `active: <slug> · <N>/<M> screened · type /help for commands` (parts degrade gracefully: no active project → `type /help to see what this harness can do`).
   - `<N>/<M>` = screening progress: read-only SQLite read of the active project's `review.db` via `bun:sqlite` (stdlib-compatible db, read-only open, cached with a short TTL + refreshed on session idle/turn-end events — never poll in a tight loop, never block the UI thread; on any read error the counts silently drop out of the hint).
   - Never uses console.* (TUI-active code).

3. **Wiring + docs.**
   - `research/package.json`: add `"extensions": ["extensions/research-mode"]` to BOTH the omp and pi manifests.
   - `bin/research doctor`: one new check — the installed plugin exposes the extension (file exists under the omp plugin dir) and a one-line note pointing at `/help`.
   - `docs/RUNBOOK.md`: new short section "See what you can type" after Part 0 (the /help output + statusline hint); update the Appendix smoke test to include `/help`.
   - `docs/ARCHITECTURE.md`: layer-map row for the extension + one sentence in the mode section.

## Out of scope (flagged, not built)

- A TUI widget/dashboard panel (ExtensionWidgetContent exists — future upgrade path).
- A startup banner (the welcome panel is omp's; not overridden).
- Translating the builtin `/help` (coding-oriented) — we add our own surface, not patch packages/.
- Interactive wizard UI.

## Acceptance

- `research` TUI: typing `/` shows the 13 research commands among suggestions; typing `/help` renders the capability guide; statusline shows the research hint with live screening counts once a project has a review.db.
- `bash setup.sh` re-run installs the extension (idempotent); `bash bin/research doctor` passes with the new check; `bash research/tests/run.sh` still 91+ green; `bun test` passes including the new extension tests; extension registers cleanly (no runtime errors in a live probe).
- No files outside research/, bin/, docs/ touched.
