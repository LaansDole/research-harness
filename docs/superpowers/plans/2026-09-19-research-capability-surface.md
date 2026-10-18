# Research Capability Surface (/help command + statusline hint) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers-executing-plans discipline. Steps use checkbox syntax. Read the design spec FIRST: `docs/superpowers/specs/2026-09-19-research-capability-surface-design.md`.

**Goal:** A researcher opening `research` immediately sees what the harness can do: a `/help` capability guide (real extension command, researcher-voiced) and a statusline hint showing the active project + screening progress.

**Architecture:** One new omp extension under `research/extensions/research-mode/` shipped through the existing plugin manifest (`extensions` key, omp + pi). The extension registers one command (renders a bundled markdown guide) and sets one statusline value (active project slug + screened counts read read-only from the active project's review.db via bun:sqlite, cached). Zero changes to packages/ or crates/.

**Tech Stack:** TypeScript extension module (loaded from source by omp, peer types only), bun:sqlite, bun test, bash.

---

## Verified platform facts (measured by the parent session, 2026-09-19 — do not re-derive)

- Prompt templates are surfaced in the `/` picker with their frontmatter `description` (packages/coding-agent/src/modes/interactive-mode.ts:1853-1883). Templates whose name collides with any command token are FILTERED from the picker via `reservedNames` (line 1859) and builtin commands resolve before template expansion — so a `help.md` prompt template is invisible AND dead. The guide must be an extension command.
- Plugins ship extensions via `"extensions": [...]` in the manifest — packages/coding-agent/src/extensibility/plugins/types.ts:15 (omp) and :40 (pi); resolution in plugins/loader.ts:297-305.
- Extension API: `registerCommand(name, options)` (extensions/loader.ts:223); `setStatus(key, text | undefined)` (extensions/types.ts:263). StatusLineComponent renders setStatus values (interactive-mode.ts:1292).
- Proven working extension example (API usage, module shape, RPC smoke): read `~/.hermes/skills/software-development/omp-implementation-dispatch/references/omp-statusline-extension.md` before writing any code.
- Headless command resolution works: `research -p --no-tools --no-session "..."` expands prompt templates (verified in the runbook round).
- Current test baseline: `bash research/tests/run.sh` → 91 tests OK (skipped=1), plus `bun test` for repo packages (do not regress either).

## Repo rules that bind this work

- Tabs for indentation; no `any`; no `ReturnType<>`; no inline/dynamic imports; ES `#private` where needed; `Promise.withResolvers()` over `new Promise`; never edit `packages/`, `crates/`, root package.json.
- No `console.*` in TUI-active code (extension runs inside the TUI).
- Prompt/help CONTENT lives in `.md` files, imported with `import help from "./help.md" with { type: "text" }` — never inline strings, never readFile.
- Central utilities first; do not hand-roll SQLite or frontmatter parsing that a sibling script already provides.
- Commits: conventional messages, one logical change per commit, on the feature branch this dispatch creates (see Task 0). NEVER push. NEVER rebase.
- `research/` scripts stay python3-stdlib; the extension is the ONLY TypeScript in the research layer.

---

### Task 0: Branch + live API probes (do this before writing code)

**Files:** none committed.

- [ ] `git checkout -b feat/capability-surface` (off current main HEAD; there are unrelated unverified commits on main — do not touch them, do not rebase, do not push).
- [ ] Read, and record the exact signatures you will code against:
  - `packages/coding-agent/src/extensibility/extensions/loader.ts` around `registerCommand` (line ~223): full options object (description? handler? handleTui? getTuiAutocompleteDescription? argumentHint?).
  - `packages/coding-agent/src/extensibility/extensions/types.ts`: the full extension API surface — especially `setStatus` and which lifecycle events an extension can subscribe to (turn end / session idle / agent end). Write down the exact event names.
  - The omp-statusline reference (path above) for the proven module shape and smoke method.
- [ ] PROBE A (command override): does an extension-registered `help` shadow the builtin `help`? Build a throwaway probe: copy `research/` to `/tmp/rh-ext-probe/research`, add a minimal extension registering `help` that returns a one-line marker, add `"extensions": ["extensions/probe"]` to the COPY's package.json omp+pi manifests, `omp plugin install --force /tmp/rh-ext-probe/research`, then `omp -p "/help"` and inspect which output you got. Record the resolution order you observed. Decision rule: extension wins → name the real command `help`; builtin wins → name it `guide` and use `/guide` everywhere in the guide text and docs. After probing: `omp plugin install --force ~/Projects/research-harness/research` to restore the real plugin, and verify `omp plugin doctor` is clean.
- [ ] PROBE B (statusline visibility): with the probe extension also calling `setStatus("research", "probe-marker")`, launch the TUI under a PTY (`script -q /tmp/probe-capture.txt research` with a short sleep, then quit; or any PTY method you can drive non-interactively) and confirm the marker text appears in the captured output. If setStatus text is NOT rendered anywhere visible in the TUI, the statusline piece is dead — record that finding and DOWNSCOPE: the hint moves into the `/help` output and the guide tells the user to type `/help`; do not ship an invisible feature.

### Task 1: Extension scaffold + capability guide

**Files:**
- Create: `research/extensions/research-mode/index.ts`
- Create: `research/extensions/research-mode/help.md`
- Create: `research/extensions/research-mode/README.md` (3-6 lines: what it registers, how it loads)

- [ ] `help.md` — the guide content. Researcher voice, no coding jargon. Structure:
  1. One-line identity ("This is your research workspace — it finds, screens, and organizes papers for a review.")
  2. "Where to start" — exactly three paths: starting fresh → `/scope`; have records from a database search → `/import`; want a quick end-to-end pass → `/litreview`.
  3. Table of ALL commands: `command | what it does | when you'd use it`. Plain-words "what" and one-line "when". All 13: scope, databases, searchstring, find, import, dedupe, screen, fulltext, review, graph, prisma, export, litreview.
  4. "You can also just type sentences" — one example ("screen the first 10 records against my criteria") and the note that the assistant proposes the next step after every command.
  5. Footer: `run 'research doctor' if something looks broken`.
- [ ] `index.ts` — default-export the extension factory (shape per the loader + statusline reference): registers the command (name per Task 0 decision; description "Show what the research harness can do"; renders help.md text via `runtime.output(...)` or the TUI path the loader shows) and implements the statusline hint (Task 2). Types imported type-only from peers; runtime behavior only via the passed `api`/`runtime` objects. No `console.*`.
- [ ] The command list in help.md must stay in sync with `research/prompts/*.md` — enforced by Task 2's test, not by hope.

### Task 2: Tests (bun test, repo conventions)

**Files:**
- Create: `research/extensions/research-mode/test/help.test.ts`
- Create: `research/extensions/research-mode/test/statusline.test.ts`

- [ ] Write the failing tests first, then implement to green. Run: `bun test research/extensions/research-mode/test/`.
- [ ] `help.test.ts` contracts:
  - Every prompt-template name derived from globbing `research/prompts/*.md` (fs listing, not a hardcoded array) appears in the help.md text — the guide cannot drift from the picker. If a template is added later without updating help.md, this test fails naming the missing command.
  - help.md contains the three "where to start" paths (`/scope`, `/import`, `/litreview`) and the plain-sentence section header.
- [ ] `statusline.test.ts` contracts (pure helper functions exported from a separate module so tests never need omp's runtime):
  - `buildResearchHint({activeProject, screened, total, dbError})` returns the exact degraded strings: no project → the no-project hint; project with counts → `active: <slug> · <N>/<M> screened · type /help for commands`; project without review.db → hint without counts; dbError → hint without counts (never throws).
  - Screening-count reader against a fixture SQLite db built in `tempfile` (fixture in the test, torn down after): correct N/M from verdict rows; missing file → null counts; corrupt file → null counts; READ-ONLY open (fixture chmod 444 stays readable, and the reader must not create or modify any file — assert mtime unchanged).
- [ ] Full-repo gates still green: `bash research/tests/run.sh` (91+ OK) and `bun test` (existing suites unaffected).

### Task 3: Statusline wiring in the extension

**Files:**
- Modify: `research/extensions/research-mode/index.ts` (hint assembly; reader lives in `research/extensions/research-mode/statusline.ts` for testability)

- [ ] Active project: read `~/.research-harness/active-project` (single line). Counts: read-only `bun:sqlite` open of `~/.research-harness/projects/<slug>/review.db`; N = records with a `ta_verdict` (or the store's actual screened-state column — read `research/skills/literature-search/scripts/review.py` schema DDL first and use ITS truth, not a guess), M = total records. Use exactly the state names the schema defines.
- [ ] Cache with a short TTL (5 s) and refresh on the lifecycle event you recorded in Task 0 (turn end / session start / idle). Never poll on an interval. Any read error → counts silently omitted (hint degrades), never an exception to the UI.
- [ ] `setStatus(key, undefined)` on session end / when no project exists, per the API's contract (check types.ts for what clearing means).
- [ ] Probe B result must hold for the real extension: TUI PTY capture shows `active: <slug>` (with the real project present) or the no-project hint with none.

### Task 4: Wiring — manifest, setup, doctor

**Files:**
- Modify: `research/package.json` (add `"extensions": ["extensions/research-mode"]` under BOTH `omp` and `pi`)
- Modify: `bin/research` (doctor: new check that the plugin's installed copy exposes `extensions/research-mode/index.ts`; on success print `ok extension research-mode (/help guide + statusline)`; also add one line to the final `status: ready` hint: `— type /help in the TUI to see every command`)

- [ ] `bash setup.sh` re-run (idempotent) → `omp plugin list` shows the plugin; `omp plugin doctor` clean (extension loads without error).
- [ ] `bash bin/research doctor` → all ok including the new line.
- [ ] Live headless probe: `research -p --no-tools --no-session "/help"` (or `/guide` per Task 0) → output contains the command table. With tools enabled and scratch state, statusline probe repeat under PTY.

### Task 5: Docs + final gates + commit

**Files:**
- Modify: `docs/RUNBOOK.md` (new short section "See what you can type" right after Part 0: show the `/help` output shape and the statusline hint, 15-25 lines, same researcher voice)
- Modify: `docs/ARCHITECTURE.md` (layer-map row: extension path → responsibility; one sentence in the mode section)

- [ ] RUNBOOK section added; the doc's "Everything below was executed on..." honesty line still holds — only claim what you saw.
- [ ] Full gate sweep, all green before the last commit: `bash research/tests/run.sh`; `bun test`; `bun run check` (if it reaches the extension file and errors, fix; do not add a standalone tsc step); `bash bin/research doctor`; `bash setup.sh` idempotency; the Task 4 headless probe.
- [ ] Verify scope: `git diff --stat main` touches ONLY research/, bin/, docs/. `git status` clean of stray files. No secrets, no absolute /Users paths in committed content (RUNBOOK rule continues to hold for new text).
- [ ] Commits (order): `feat(research): /help capability guide + statusline research hint (extension)`; then `docs(runbook): surface the capability guide and statusline hint`. On branch `feat/capability-surface`. Do NOT push, do NOT merge to main, do NOT touch the unrelated sync commits.
- [ ] Exit summary: probe A/B findings (which name won; statusline visible yes/no), exact setStatus event wiring used, files changed, test counts, deviations.
