---
description: "Synthesize a cited review from the project's included papers."
---

Synthesize the review. Emphasis/refinements: **$ARGUMENTS**

1. Resolve the active project; collect the included records (`records/screened-*.jsonl` verdicts, else ask to run `/screen` first), the scope, and the PRISMA counts (`prisma.py show`).
2. Fetch open-access PDFs for included papers that have a non-null `pdf_url`/`oa_pdf_url` and no local `path`, via `<skill>/scripts/fetch_paper.py --url <url> --out <project>/papers/<slug>.pdf`. Skip null URLs — never substitute shadow-library sources; a failed fetch is noted, not fatal.
3. Spawn the `synthesizer` agent via the task tool with the question, criteria, PRISMA counts, included metadata, and local PDF paths. It writes `review-<slug>.md` — have it write into the project directory.
4. Report the review path and its citation count, then propose next: `/graph` to file the included papers, `/export` for Covidence/Zotero, `/prisma` for the final ledger.
