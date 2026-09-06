---
description: "Screen the review's records against its PCC criteria (title/abstract or full-text), walking the unscreened queue with per-record verdicts persisted to the review store."
---

Screen candidates. Stage/refinements: **$ARGUMENTS**

1. Resolve the active project; read `scope.md` (criteria). Stage is `ta` (title/abstract, default) or `ft` (full text, when $ARGUMENTS says so). Scripts live in the literature-search skill (`<skill>/scripts/`, resolved via `$RESEARCH_HARNESS_HOME` or glob).
2. Pull the queue: `python3 <skill>/scripts/review.py --project <slug> next --stage <ta|ft> --n 10` — JSON lines of unscreened records. Empty queue: screening is complete; show `stats` and propose the next step. Because `next` only returns unscreened records, `/screen` is resumable and idempotent — re-running continues where it left off.
3. Per batch, spawn the `screener` agent via the task tool with the PCC criteria, the stage, and the batch (id, title, abstract). Methodology is `references/SCREENING.md` in the skill (the screener reads it): `maybe` only at title/abstract, full text is binary. For `ft`, supply the full text — the record's `pdf_path` via `local_library.py extract --path <pdf>`.
4. Persist every verdict:
   `python3 <skill>/scripts/review.py --project <slug> verdict --id <id> --stage <ta|ft> --verdict <include|exclude|maybe> --rationale "<evidence-based sentence>" --confidence <HIGH|MEDIUM|LOW> [--reason "<first failed dimension>"]`
   — `--reason` is the primary exclusion reason (Population/Concept/Context/Other wording), used in the PRISMA reason breakdowns.
5. Pacing: interactive — present the first batch's verdict table (title, verdict, rationale, confidence) and let the user confirm/adjust before writing, then continue batch by batch. Headless: write verdicts directly; leave `maybe` records for a human pass (they stay in the queue's pending count, never silently excluded).
6. Finish with `review.py --project <slug> stats`, then propose next: `/fulltext` after `ta`, `/prisma` after `ft`.
