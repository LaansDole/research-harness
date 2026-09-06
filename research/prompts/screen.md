---
description: "Screen the review's candidate records against its PCC criteria (title/abstract, optional full-text) with per-paper verdicts."
---

Screen candidates. Stage/refinements: **$ARGUMENTS**

1. Resolve the active project; read `scope.md` (criteria) and the candidate records — prefer `<project>/records/deduped-*.jsonl` (from `/prisma dedupe`), else concatenate all `records/*.jsonl` and warn that deduplication has not run.
2. Spawn the `screener` agent via the task tool with the PCC criteria, `stage=title-abstract` (or `stage=fulltext` if $ARGUMENTS says so — full text for local papers via `local_library.py extract --path <pdf>`), and the batch (id, title, abstract each). Methodology is `references/SCREENING.md` in the literature-search skill; the screener reads it.
3. Present the verdict table: title, verdict, rationale, confidence. Interactive: let the user confirm/adjust. Headless: keep `include` verdicts, treat `maybe` as exclude.
4. Persist: write verdicts to `<project>/records/screened-<date>.jsonl` (record + verdict + rationale). Update the ledger with each exclusion reason and the include count:
   `python3 <skill>/scripts/prisma.py --project <project> exclude --reason "<reason>" --count <n>` per distinct primary reason, then `... include --count <n>`.
5. Report include/exclude/maybe counts and show `prisma.py show`, then propose next: `/review` to synthesize, `/graph` to file includes into the paper graph.
