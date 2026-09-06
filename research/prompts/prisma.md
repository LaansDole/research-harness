---
description: "Dedupe candidate records and show the PRISMA ledger (identified, duplicates removed, screened, excluded with reasons, included)."
---

PRISMA ledger: **$ARGUMENTS**

Scripts live in the literature-search skill (`$RESEARCH_HARNESS_HOME/research/skills/literature-search/scripts/`, else glob). Resolve the active project first.

- Argument says "dedupe" (or records exist that were never deduped): concatenate `<project>/records/found-*.jsonl` and `imported-*.jsonl` into one file, then
  `python3 <skill>/scripts/prisma.py --project <project> dedupe --records <all.jsonl> > <project>/records/deduped-<date>.jsonl`
  — dedupes by DOI then normalized title, updates `duplicates_removed`, prints kept records.
- Argument carries manual corrections ("identified embase 342", "excluded 'wrong population' 12"): apply via `identify`/`exclude`/`include`/`dedupe --removed`.
- Always finish with `python3 <skill>/scripts/prisma.py --project <project> show` and print the block verbatim in a code block. If it prints an arithmetic WARNING, diagnose which count is stale and fix it now.
- State what each number came from (which searches/ files, which record files) so the flow diagram is reproducible, then propose the next step (`/screen` if unscreened, `/review` if screened).
