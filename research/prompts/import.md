---
description: "Import RIS/BibTeX/CSV exports from databases the harness cannot query (PubMed, Embase, Scopus, ...) into the active review."
---

Import reference export(s): **$ARGUMENTS**

1. Resolve the active project. The argument names one or more files (`.ris`, `.bib`, `.csv`) and optionally the source database ("from embase"). No file named: ask for the path.
2. For each file run `python3 <skill>/scripts/refs_io.py import --path <file>` (skill = literature-search, resolved via `$RESEARCH_HARNESS_HOME` or glob — never an absolute assumption). It emits one JSON record per line and reports skipped malformed entries on stderr.
3. Append the records to `<project>/records/imported-<database or basename>-<date>.jsonl`. Note skip counts honestly.
4. Update the ledger: `python3 <skill>/scripts/prisma.py --project <project> identify --database <database> --count <n>` using the database the user named (else the file basename). If a `searches/NN-<database>.md` entry has `hits: pending`, fill in the hits.
5. Report imported/skipped per file and the running identified totals, then propose next: `/prisma` to dedupe across all record files, then `/screen`.
