---
description: "Run the searches this harness CAN run: arXiv + OpenAlex + the local PDF corpus. Saves deduped candidate records to the project."
---

Find candidate papers for: **$ARGUMENTS** (empty: use the active project's scope)

1. Resolve the active project and its `scope.md`. The query is $ARGUMENTS if non-empty, else the scoped question. A candidate cap in the argument ("max N") is honored.
2. Spawn the `scholar` agent via the task tool with the question, cap, and — when `RESEARCH_CORPUS_DIR` is set — the corpus directory (corpus is READ-ONLY). Corpus-only if the user asked for offline; otherwise corpus + arXiv + OpenAlex.
3. Save the returned deduped candidates as JSON lines to `<project>/records/found-<date>.jsonl`.
4. Update the PRISMA ledger per source actually searched: `python3 <skill>/scripts/prisma.py --project <project> identify --database arxiv --count <n>` (likewise `openalex`, `local-corpus`). Record each executed query under `<project>/searches/` (database, string, date, hits) like /searchstring does.
5. Report counts per source and totals, then propose next: `/import` for records from manual database searches, or `/prisma` to dedupe, or straight to `/screen`.
