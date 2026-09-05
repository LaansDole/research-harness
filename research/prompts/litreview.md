---
description: "Run a mini literature review: search, screen, fetch OA PDFs, synthesize with citations, ingest into the paper graph."
---

Run a mini literature review for: **$ARGUMENTS**

Pipeline — execute in order:

1. **Restate the question.** Extract the research question from the argument above. If the argument also states screening criteria (e.g. after "criteria:"), use them verbatim. If no criteria were given, ask the user for include/exclude criteria; default to relevance-based include/exclude (include = the paper directly addresses the question) if they decline or in headless mode.
2. **Search.** Spawn the `scholar` agent via the task tool with the research question (and any candidate cap from the argument). It returns deduped candidates with abstracts.
3. **Screen.** Spawn the `screener` agent via the task tool with the criteria plus the full candidate batch (id, title, abstract per candidate).
4. **Present verdicts.** Show a table: title, verdict, rationale. Interactive: ask the user to confirm/adjust includes. Headless/-p mode: proceed with the `include` verdicts automatically (treat `maybe` as exclude).
5. **Fetch OA PDFs.** For each included paper with a non-null `pdf_url`/`oa_pdf_url`, run `python3 ~/Projects/research-harness/research/skills/literature-search/scripts/fetch_paper.py --url <url> --out ./papers/<id or slug>.pdf` (if that path is absent, glob for `**/literature-search/scripts/fetch_paper.py`). Skip null URLs — never substitute shadow-library sources. A failed fetch is noted, not fatal.
6. **Synthesize.** Spawn the `synthesizer` agent via the task tool with the research question, the criteria and counts, the included papers' metadata, and the local paths of any fetched PDFs. It writes `review-<slug>.md` in the cwd.
7. **Report.** Print the review file path, include/exclude/maybe counts, and how many PDFs were fetched.
8. **Grow the paper graph.** Locate `paper_graph.py` (try `~/Projects/research-harness/research/skills/paper-graph/scripts/paper_graph.py`, else glob for `**/paper-graph/scripts/paper_graph.py`). Then, for the INCLUDED papers only:
   - `add` each with a stable slug id and all known metadata (`--title --authors --year --venue --doi --url --abstract`).
   - `link` every pair of included papers with `--type same-topic --note "<review slug>"` (they co-appear in this review).
   - Run `auto-edges <id>` for each added paper to pull citation edges from OpenAlex; a failed or empty run is noted, not fatal.
   - Print the output of `stats` so the user sees the graph grow.
