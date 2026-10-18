# Testing Runbook for research-harness — Implementation Plan

> **For agentic workers:** This is a DOCS-ONLY dispatch. The deliverable is `docs/RUNBOOK.md` — a step-by-step testing runbook the repo owner (a researcher, non-technical) can follow manually to test the harness against their REAL scoping review. Every command documented in the runbook must have been executed by you (the dispatched agent) during pre-flight, against scratch state, before it is written into the doc. A runbook with untested commands is the staged-demo failure mode in document form — that failure mode is banned in this repo.

**Goal:** `docs/RUNBOOK.md` — a researcher-friendly runbook that walks the user through testing the full harness pipeline (setup gates → import → dedupe → screen → fulltext → PRISMA → review → graph → export) using their real review artifacts.

**Architecture:** The runbook is a single committed markdown doc under `docs/`. No code changes. All pre-flight execution happens against a THROWAWAY project directory and a throwaway paper-graph DB so the user's real state (`~/.research-harness/`, `active-project`, `papers.db`, the real project slug) is untouched.

**Tech Stack:** bash, python3 stdlib scripts already in the repo, omp CLI.

---

## Verified facts (measured by the parent session, 2026-09-19 — re-verify, do not contradict)

- Repo root: `/Users/laansdole/Projects/research-harness`, branch `main`, clean.
- `bash setup.sh` — idempotent installer. **Current state: `bash bin/research doctor` FAILs on `/dedupe` and `/fulltext` prompts missing from `~/.omp/agent/prompts/`** — step 0 of the runbook is `bash setup.sh` then re-run doctor until all-ok. setup.sh protects `reviewer.md reviewer-deep.md tldr.md pr.md` from overwrite and keeps existing `config.env`.
- `bash research/tests/run.sh` → `Ran 91 tests ... OK (skipped=1)`, ~0.15 s. Include as a pre-gate.
- `bin/research` launches the TUI in research mode; config comes from `~/.research-harness/config.env` (sets `RESEARCH_HARNESS_HOME`, `PAPER_GRAPH_DB=/Users/.../.research-harness/papers.db`, `RESEARCH_CORPUS_DIR=/Users/.../Research/Papers`).
- Review store: `research/skills/literature-search/scripts/review.py` — subcommands `import (--path, --database)`, `dedupe`, `verdict`, `next`, `set-state`, `get`, `list`, `stats`; `--project` accepts a slug under `~/.research-harness/projects/` **or a directory path** (use the directory form for scratch).
- Import/export: `refs_io.py import --path <file>` → JSON lines on stdout; handles RIS/BibTeX/CSV. `refs_io.py export --from-graph ... --format ris|bib` (check `--help` for exact flags; a past pitfall: export needs `--from-graph`, it does not read stdin silently).
- PRISMA: `prisma_scr.py` derives the diagram from `review.db` states — formats `text` (primary), `mermaid`, `svg`. The arithmetic holds by construction; numbers are never hand-typed.
- Corpus: `/Users/laansdole/Research/Papers` — 43 PDFs. **Known-bad file: `978-3-032-16708-8_5.pdf` is a 146-byte 404 HTML page saved with a .pdf extension** — the scanner must skip it with `extract_error`, never crash. Historical baseline was 44 records from 44 files; the corpus is now 43 files, so MEASURE the current scan numbers live and stamp them with the date instead of quoting folklore.
- CSV export (real review artifact): `/Users/laansdole/Research/csv-multi-agen-set.csv` — 50 PubMed records + header. Columns: `PMID, Title, Authors, Citation, First Author, Journal/Book, Publication Year, Create Date, PMCID, NIHMS ID, DOI`. UTF-8 BOM + CRLF line endings; Authors field contains commas inside quoted `Surname, Given` lists. Verify the CSV importer maps these columns correctly — watch for the historical author-splitting bug class (`;` is the only author separator; `"Kim, Y."` must stay one author).
- Screening criteria (real review): `/Users/laansdole/.hermes/skills/covidence-screening/CRITERIA.md` — PICO/PCC for "LLM-Driven Collaborative and Multi-Agent Framework in Healthcare Settings". Key testable rule: `2+ LLM agents` requires one agent's reasoning CONDITIONED on another's output; fixed-order role pipelines and one-controller-many-tools do NOT qualify. Screening methodology: `research/skills/literature-search/references/SCREENING.md` (title/abstract: include|exclude|maybe; no-abstract ⇒ exclude; rationale quotes evidence; first-failed-dimension exclusion reason; Confidence HIGH/MEDIUM/LOW).
- Real harness project: slug `multi-agent-llm-clinical-decision-support` (scope.md drafted, `records/` empty, NO review.db yet). The runbook's worked example uses THIS project — the user's first real `/import` creates its review.db. Your pre-flight must use a scratch directory instead.
- Global paper graph: `~/.research-harness/papers.db` currently 0 papers / 0 edges.
- 13 prompt commands exist: `/scope /databases /searchstring /find /import /dedupe /screen /fulltext /prisma /review /graph /export /litreview`.
- Open-access policy: fetch only via `pdf_url`/`oa_pdf_url` (OpenAlex → Unpaywall → arXiv → local corpus → web-search-candidate-for-human-review). Unpaywall requires an email env (`UNPAYWALL_EMAIL`/`OPENALEX_MAILTO`) — if unset the step is SKIPPED with a stderr notice, never a fake address.

## Hard constraints (violating any of these fails the dispatch)

1. **READ-ONLY**: `/Users/laansdole/Research/Papers` and `/Users/laansdole/Research/csv-multi-agen-set.csv` — never write, move, or delete anything there.
2. **Scratch state only**: do all pre-flight runs with `review.py --project /tmp/<scratch-dir>` (directory form) and `PAPER_GRAPH_DB=/tmp/<scratch>/papers.db`. Never import into the real project, never write `~/.research-harness/` (EXCEPT: running `bash setup.sh` is allowed — it is the repo's own idempotent installer and protects the user's agent files), never modify `~/.omp/agent/config.yml`, `reviewer*.md`, `tldr.md`, `pr.md`, or `active-project`.
3. **Docs-only deliverable**: the only file you create in the repo is `docs/RUNBOOK.md`. If pre-flight exposes a real code defect (e.g. CSV column mapping or author parsing is wrong), DO NOT fix code — record it in the runbook's "Known issues" section with the exact reproduction command and report it prominently in your exit summary. A separate dispatch fixes code.
4. Commit locally with a single `docs(runbook): ...` commit. Do NOT push.
5. No absolute `/Users/...` paths in the runbook (use `~/...` forms). No Covidence review IDs or internal tracking numbers in the runbook. Gate: `grep -c "/Users/" docs/RUNBOOK.md` must be 0.
6. Researcher voice (the repo's Covidence-friendliness bar): plain language, numbered steps, each step says what to type, what you should see, and what it means if you don't see it. No flag soup on the primary path; headless/CLI alternatives go in a clearly-marked appendix.

---

### Task 1: Environment re-verification

**Files:** none (environment only).

- [ ] Run `bash setup.sh` (fixes the 2 missing prompts). Then `bash bin/research doctor` → all-ok.
- [ ] Run `bash research/tests/run.sh` → expect `91 tests ... OK (skipped=1)`.
- [ ] Confirm the 13 prompt files land in `~/.omp/agent/prompts/`.
- If doctor still fails, diagnose BEFORE proceeding; the runbook documents a green path, not a broken one.

### Task 2: Pre-flight A — review-store mechanics on scratch state

**Files:** none committed. Scratch under `/tmp/runbook-preflight/`.

- [ ] `mkdir -p /tmp/runbook-preflight/scratch-project` and copy the real CSV there is NOT needed — point `refs_io.py import --path ~/Research/csv-multi-agen-set.csv` directly at the real file (read-only) and pipe into `review.py import --project /tmp/runbook-preflight/scratch-project --database "pubmed"`. Read `review.py import --help` first and follow the real data flow (does import take the file directly, or JSON lines on stdin via refs_io? Use whichever the scripts actually implement and document THAT flow).
- [ ] Verify: record count = 50; spot-check 3 records for author integrity (`Chen X, Yi H, ...` must remain one Authors string split on `;` only), DOI and year parsed, title not truncated.
- [ ] `review.py dedupe` → note how many duplicates this PubMed set actually contains.
- [ ] `review.py next --limit 3` (check exact flag) → take the first 3 records, write ONE include verdict and ONE exclude verdict using the real criteria from `~/.hermes/skills/covidence-screening/CRITERIA.md` (read it first; exclusion reason = first failed dimension; evidence-based rationale). Persist via `review.py verdict`. Capture the exact verdict-command syntax that works (including `--confidence HIGH` as a LABEL, not a float).
- [ ] `review.py stats` → capture the state-count JSON.
- [ ] `prisma_scr.py text` (exact invocation per its `--help`) against the scratch project → capture the box-drawn diagram + arithmetic line. This output shape goes verbatim into the runbook's "what you should see".
- [ ] `refs_io.py export` from the scratch graph to `.ris` → confirm the export round-trips (≥ the verdicted records, valid RIS `TY/ER` records).

### Task 3: Pre-flight B — corpus scan + fulltext retrieval

**Files:** none committed.

- [ ] `local_library.py scan --dir ~/Research/Papers` (pipe through a `json.loads` loop; stdout must parse). Measure: N records, titles/abstracts/DOIs success, zero crashes, elapsed seconds, and confirm the known-bad `978-3-032-16708-8_5.pdf` appears as an `extract_error` (or clean skip), not a crash. Stamp these numbers with today's date in the runbook.
- [ ] `local_library.py extract --path <one real PDF>` → confirm full text returns.
- [ ] `fetch_paper.py resolve` (exact flags per `--help`) for one record with a known DOI from the CSV → record which cascade step wins (`oa_source`) and `oa_status`. If the network is rate-limited (arXiv 429), do NOT hammer — document the backoff behavior as a feature in the runbook's troubleshooting table and move on; do not stall the dispatch on retrieval.
- [ ] Confirm nothing in `~/Research/` changed: `find ~/Research/Papers -newer /tmp/runbook-preflight -name "*.pdf" | wc -l` must be 0.

### Task 4: Pre-flight C — invocation semantics (TUI vs headless)

**Files:** none committed.

- [ ] Verify what a headless research-mode invocation actually is. Test: `omp -p --append-system-prompt research/mode/system.md "/stats"` (or the shortest real command) from the repo root with `PAPER_GRAPH_DB` pointed at scratch — does `/command` syntax expand prompt templates in `-p` mode? Record what actually happens. Whatever you find, document BOTH: (a) the primary path for the user = launch the TUI with `research` (or `bash bin/research`) and type slash-commands + plain sentences; (b) the headless pre-flight form that you verified works, for users who want to script a check.
- [ ] Verify `research` launcher resolves from PATH (doctor said ok) and what it prints on startup.

### Task 5: Author `docs/RUNBOOK.md`

**Files:**
- Create: `docs/RUNBOOK.md`

Required structure (every command block must be one you ran in Tasks 2-4, with outputs you actually saw):

- [ ] **Title + one-line purpose** — "how to test-drive research-harness on a real review".
- [ ] **Part 0 — Environment gates** (5 min): `bash setup.sh` → `bash bin/research doctor` (all-ok) → `bash research/tests/run.sh` (91 tests). What each failure means + the fix.
- [ ] **Part 1 — The worked pass** (~30-45 min of user time), using the real review artifacts: step 1 import the PubMed CSV into the project; step 2 `/dedupe` + verify counts; step 3 screen a bounded batch (first ~10 records — state clearly this is a smoke pass, the full queue is resumable via `/screen` any time) with the criteria file's PCC rules and 2-3 example verdicts INCLUDING the discriminating multi-agent rule (a fixed-order pipeline = exclude); step 4 `/fulltext` on screened-in records (OA-only, what `fulltext_not_retrieved` means); step 5 `/prisma` — show the derived text diagram and the arithmetic check; step 6 `/review` for a short cited synthesis; step 7 `/graph` to file includes into the paper graph and view in-TUI; step 8 `/export` to RIS and re-import sanity.
- [ ] **Part 2 — Assertion checklist**: a table of "checkpoint → expected → what failure means". Expected numbers = the ones YOU measured (scan success rate, dedupe count, PRISMA arithmetic identity), dated.
- [ ] **Part 3 — Starting a brand-new review**: the `/scope` → `/databases` → `/searchstring` knowledge flow with a plain-language example prompt, plus the "at least 2-3 databases" rule and the paywalled-database boundary (harness hands you paste-ready strings; you run them in PubMed/Embase yourself and bring RIS back via `/import`).
- [ ] **Part 4 — Troubleshooting table**: missing prompts → `bash setup.sh`; arXiv 429 → the built-in backoff (3s/9s/27s) and "don't probe while it backs off"; the known-bad corpus PDF; no-abstract ⇒ exclude; Unpaywall email env; rate-limit etiquette; where state lives (`~/.research-harness/`) and how to reset a test safely (delete a project dir).
- [ ] **Appendix — headless checks**: the verified `omp -p` invocation for scripting a smoke test.
- [ ] **Style gates**: researcher voice; numbered steps; every step = what to type / what you should see / what failure means; `grep -c "/Users/" docs/RUNBOOK.md` = 0; no review IDs; ~250-400 lines.

### Task 6: Gates + commit

- [ ] Re-run every command block in the finished runbook mechanically (extract fenced bash blocks, execute the read-only/scratch ones again) — any block that fails means the doc is wrong: fix the doc, not the command.
- [ ] `grep -c "/Users/" docs/RUNBOOK.md` = 0; `git status --short` shows ONLY `docs/RUNBOOK.md` (plus the pre-existing gitignored `docs/superpowers/`).
- [ ] `bash research/tests/run.sh` still green.
- [ ] Commit: `git add docs/RUNBOOK.md && git commit -m "docs(runbook): end-to-end testing guide on a real scoping review"` — do NOT push.
- [ ] Exit summary: files changed, the measured numbers you stamped into the doc, any code defects found (exact reproduction), deviations from this plan.
