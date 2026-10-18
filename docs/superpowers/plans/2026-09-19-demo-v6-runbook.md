# v6 guided-review demo (RUNBOOK-driven capture) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers-executing-plans discipline. Read the spec FIRST: `docs/superpowers/specs/2026-09-19-demo-v6-runbook-design.md`, then the demo reference `~/.hermes/skills/research/research-harness/references/demo-recording.md` (rejection history v1-v5 is binding; v5 rules apply). Follow tasks in order — pre-flight BEFORE render, always.

**Goal:** Replace the 589 s hero capture with a RUNBOOK-driven one: the tape walks docs/RUNBOOK.md's Part 0 + Part 1 turn-by-turn with per-turn pacing from measured pre-flight runtimes, showcases /help + the statusline, and lands with a refreshed README + republished Pages site.

**Architecture:** Headless pre-flight of every typed line (validates output + measures runtime) → vhs tape with per-turn Type/Enter/Sleep → mechanical post-process → README edit → commit+push main → gh-pages republish → served-content verification → state restoration.

**Tech Stack:** vhs 0.11, ffmpeg/ffprobe, omp CLI, gh-pages worktree.

---

## Verified facts (parent session, 2026-09-19 — do not re-derive)

- Current shipped: `assets/research/guided-review.mp4` 589 s / 19.7 MB (v5, one-shot prompt + fixed Sleep = the dead-air problem), `guided-review-poster.png` 687 KB, `search-strings.png` inline. `paper-graph.mp4` 379 s stays untouched.
- Tape settings (v5, keep): Width 1600 / Height 1000 / FontSize 18 / Framerate 12 / PlaybackSpeed 1.0 / Theme "Catppuccin Mocha" / `Require omp` / `Output assets/research/guided-review.mp4` / `Set Shell "bash"`. `.gitignore` must NOT exclude the mp4.
- The mode prompt path is `$RESEARCH_HARNESS_HOME/research/mode/system.md`; drive the tape with the SAME flags `bin/research` uses (`--append-system-prompt`), never raw omp without it.
- Runbook journey to follow (docs/RUNBOOK.md): Part 0 = setup/doctor/tests; Part 1 = /import (50-record PubMed CSV) → /dedupe (0 dupes single-source) → abstract fill via /find + /dedupe (9 OpenAlex dupes merge abstracts) → /screen the first 10 (3 real verdicts incl. the fixed-pipeline exclude) → /fulltext (OA cascade) → /prisma (arithmetic line) → /review → /graph → /export. NEW capabilities to show: `/help` (13-command guide) and the statusline `active: <slug> · N/M screened · type /help for commands`.
- Known-good typed lines from v5 pre-flight (still valid, reuse where they fit): the ED-triage opening sentence, `/databases`, "can you write the search strings for those?", "now find everything you can run yourself".
- The PubMed CSV lives at ~/Research/csv-multi-agen-set.csv (READ-ONLY, 50 records + header). The corpus ~/Research/Papers is READ-ONLY (43 PDFs; do NOT point a scan at all of them inside a capture — copy a small subset to scratch if a turn needs corpus work).
- Pre-flight pattern (from the reference; REPLACES the fixed-sleep guessing):
  `env RESEARCH_HARNESS_HOME=$PWD RESEARCH_CORPUS_DIR=... PAPER_GRAPH_DB=/tmp/.../papers.db omp -p --model sonnet --hide-thinking --auto-approve --append-system-prompt research/mode/system.md --session-dir <scratch> "<line>"` — time each run; the output doubles as runbook validation.
- Post-process (keep): mpdecimate → vfr, last-activity trim with scene-score cross-check (cursor blink defeats naive detection), crf 26 +faststart, poster at the most informative moment checked at 880 px via sips.
- GitHub facts: repo-committed MP4s >1 MB do not render on github.com; Pages serves video/mp4. gh-pages is an orphan branch; README links to https://laansdole.github.io/research-harness/#guided-review. Pages publish recipe is in the reference (worktree on origin/gh-pages, replace assets, commit, push, then verify SERVED bytes).
- Push to origin/main is PRE-AUTHORIZED for this repo (working agreement). gh-pages push likewise.
- omp `-p` print mode emits nothing for locally-handled extension commands (/help) — do NOT pre-flight /help via -p; validate it via the expect/PTY probe (proven recipe: absolute launcher path, TERM=xterm-256color, pattern waits, strip ANSI before grepping; 80-col PTY truncates long statuslines mid-tail — not a bug).
- The real project `multi-agent-llm-clinical-decision-support` and its review.db MUST NOT be touched; demo in a dedicated scratch slug and restore `~/.research-harness/active-project` afterwards (note its value first). ~Research/ READ-ONLY.

## Repo rules
- v5 typed-line rules are BANNED where violated: no flags/config keys/developer instructions on screen; no "do not ask me questions"; no GRAPH-> sentinel. Researcher voice only.
- No fake output ever: the tape runs a real session; the pre-flight output is what the screen will show.
- demo project + scratch are deleted after; every restore step verified.

---

### Task 1: Pre-flight the whole journey (output + runtime per turn)

**Files:** none committed. Scratch: /tmp/rh-demo-v6/ (env, sessions, scratch project, copied corpus subset).

- [ ] Set up scratch: /tmp/rh-demo-v6/{sessions,corpus,project}; copy ~6-8 PDFs (NOT 43) from ~/Research/Papers into scratch corpus IF a turn needs corpus content; PAPER_GRAPH_DB=/tmp/rh-demo-v6/papers.db. Note current ~/.research-harness/active-project value; demo turns will create their own project slug under the REAL state home — that is expected and restored in Task 5. (Alternative if the tape env fully overrides the state home: keep everything under /tmp via env; decide by reading bin/research first and record which envs actually isolate what.)
- [ ] Pre-flight EACH typed line below in order (same session semantics as the tape: each line a fresh -p run with the mode prompt, EXCEPT lines that continue a conversation — decide per line whether the tape types it into one continuous session; if yes, pre-flight as a sequence in ONE session to match context):
  1. `research doctor` and `bash research/tests/run.sh` (shell, not omp — time them; expected all-ok / 109 OK).
  2. The ED-triage opening sentence (creates the demo project + scope.md).
  3. `/help` — expect/PTY probe only (see verified facts); capture that the 13-command table renders.
  4. `/databases`.
  5. `can you write the search strings for those?`
  6. `/import ~/Research/csv-multi-agen-set.csv` (typed as the runbook shows it).
  7. `/dedupe`.
  8. `some rows came back without abstracts - can you fill those in from sources you can query?` (the runbook's Step 3 in researcher voice; expected: OpenAlex lookups + import + dedupe merge).
  9. `/screen the first 10`.
  10. `/prisma`.
  11. `/graph add` then `/graph`.
  12. `/export included as ris`.
- [ ] For each: record the actual output (does it match the RUNBOOK's claims? if the harness's real behavior diverges, STOP and re-check the runbook text — the runbook is the contract) AND the wall-clock seconds. Build a pacing table: turn → output-verified y/n → runtime → tape Sleep (runtime + 20-30% buffer, min 15 s).
- [ ] If any turn behaves badly on camera (rate-limit stalls, >3 min waits), replace that turn with the runbook's next-best step and record why. /fulltext is the riskiest (network cascade): pre-flight it; if it is slow but bounded (<2 min), keep it with its measured sleep; if it stalls, substitute the /prisma-after-screen path per the runbook and note it.

### Task 2: Write the v6 tape

**Files:**
- Modify: `assets/research/tapes/guided-review.tape` (replace; keep the same Output path)

- [ ] Header per v5 settings (see verified facts). Hide block: env (RESEARCH_HARNESS_HOME=$PWD, PAPER_GRAPH_DB → /tmp/rh-demo-v6/papers.db, RESEARCH_CORPUS_DIR per Task 1 decision), launch the session with bin/research's exact flags, /clear if needed. The tape must be portable: no absolute /Users paths EXCEPT the pre-flighted CSV line if the runbook itself writes it that way (it does: `/import ~/Research/...` — use the same ~ form).
- [ ] Show block = the journey, each turn: `Type "<line>"` + `Enter` + `Sleep <from pacing table>`. Order: doctor → tests → open sentence → /help → /databases → search strings → /import → /dedupe → abstract fill → /screen → /prisma → /graph → /export. Between major steps, 2-5 s breathing room, no more.
- [ ] End the capture on the /prisma or /graph view (most informative closing frame), not on an idle prompt.
- [ ] Fake-check self-test: `grep -c "head -n\|# omp -p" assets/research/tapes/guided-review.tape` must be 0.
- [ ] Diagnostic mini-tape FIRST: render a 3-turn cut (opening → /help → /databases) to a throwaway output to validate typing/sleep/env wiring in ~2 min, NOT the full 13-15 min render. Fix issues at this size. Only then run the full tape.

### Task 3: Render + post-process + poster

**Files:**
- Modify: `assets/research/guided-review.mp4` (replaced)
- Modify: `assets/research/guided-review-poster.png` (replaced)
- Possibly modify: `assets/research/search-strings.png` (re-grab if the strings turn still yields a good inline frame; otherwise leave)

- [ ] Render in ONE background shell (`nohup ... vhs tapes/guided-review.tape ... &`, queue-log poll every 60 s; ~13-15 min). Never foreground.
- [ ] Post-process per the reference: mpdecimate → vfr; find last-activity frame with scene-score cross-check (cursor-blink trap); trim to last+5 s; re-encode crf 26 +faststart -an; overwrite assets/research/guided-review.mp4. Record final duration/size (ffprobe).
- [ ] Poster: extract the most informative frame (candidate: /help table or PRISMA diagram), `sips -Z 880` and READ it with vision — text must be legible at README display width; pick between candidates by legibility.
- [ ] Vision-verify 3+ frames DEEP in the timeline (not n≈50): each must show real content (the /help table, the import counts, the PRISMA diagram, the graph view). A blank/staged frame = re-diagnose, do not ship.

### Task 4: README + commit + push

**Files:**
- Modify: `README.md`
- Modify: `docs/RUNBOOK.md` (ONLY if a pre-flight divergence proved a claim wrong — otherwise untouched)

- [ ] README hero: new poster + alt text describing what is ACTUALLY on screen; new honest caption (real duration + turn count + "follows the repo's own testing runbook"); keep the Pages watch link anchor. Add one sentence to Research-mode: `/help` lists every command in plain words and the statusline shows the active project + screening progress. Quickstart: link docs/RUNBOOK.md ("test-drive it on your own review"). Sweep for stale claims: old length, turn count, any capability the demo no longer shows (search-strings.png stays only if the frame still exists in the capture).
- [ ] Asset-reference check: every `(assets/research/...)` in README resolves; delete orphaned assets ONLY if now unreferenced (search-strings.png likely stays).
- [ ] Commit on a feature branch off main: `git checkout -b feat/demo-v6-runbook` BEFORE editing assets (assets are big; keep main clean until verified). Commit message: `docs(demos): re-record guided-review following the testing runbook`.
- [ ] Push the branch, merge to main locally (--no-ff), push main (pre-authorized), verify origin/main == main.

### Task 5: Pages republish + served verification + state restore

**Files:** gh-pages branch only.

- [ ] `git fetch origin gh-pages && git worktree add --detach /tmp/pages-v6 origin/gh-pages && git checkout -B gh-pages origin/gh-pages` (per reference). Replace guided-review.mp4 + poster; update index.html caption/length if it hardcodes the old ones; `git rm` nothing else. Commit `docs(pages): republish the runbook-driven guided-review capture`, push gh-pages.
- [ ] Verify SERVED, not pushed: `curl -sI https://laansdole.github.io/research-harness/guided-review.mp4` → video/mp4 (allow CDN latency; retry a few times over ~2 min); page 200 text/html; spot-check the served page's caption matches the new one.
- [ ] Restore state: delete the demo project dir under ~/.research-harness/projects/; write the noted original slug back to ~/.research-harness/active-project; `bash bin/research doctor` → ready with active: multi-agent-llm-clinical-decision-support; verify ~/Research/ untouched (no new files; mtimes unchanged for the CSV and corpus); rm -rf /tmp/rh-demo-v6 /tmp/pages-v6 (keep the tape + assets in-repo).
- [ ] Exit summary: pacing table (turn → runtime → sleep), final mp4 duration/size, poster choice + why, README diff summary, Pages verification lines, state-restoration evidence, any runbook divergences found.
