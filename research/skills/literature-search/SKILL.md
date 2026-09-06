---
name: literature-search
description: "Use when searching academic literature. Search arXiv/OpenAlex, fetch open-access PDFs."
---

# literature-search

Four python3-stdlib CLI scripts under `scripts/` (relative to this SKILL.md). Three sources are first-class: arXiv (Atom export API), OpenAlex (api.openalex.org), and a **local PDF corpus** (no network). All emit one JSON object per line on stdout; errors go to stderr with exit 1.

Two reference documents under `references/` (relative to this SKILL.md): `SCREENING.md` (PCC criteria + verdict methodology) and `DATABASES.md` (database selection + per-database search syntax: MeSH vs Emtree vs field tags, truncation, proximity, worked multi-database example). Database recommendations and search strings MUST come from `DATABASES.md`; resolve it relative to the skill directory, and record every executed search (database, exact string, date, hits) in the project's `searches/` directory.

**Policy: Open-access sources only; never fetch from shadow libraries.**

## arxiv_search.py

```sh
python3 scripts/arxiv_search.py --query "multi-agent LLM" [--max 15] [--category cs.CL]
```

- `--query` (required): free-text query, searched as `all:<query>`.
- `--max` (default 15): max results.
- `--category` (optional): ANDs `cat:<c>` onto the query, e.g. `cs.CL`.

Output schema per line: `{"source":"arxiv", "id", "title", "authors":[...], "abstract", "published", "pdf_url"}` — title/abstract whitespace-normalized.

Sample line:

```json
{"source": "arxiv", "id": "2410.12532v3", "title": "MedAide: Information Fusion and Anatomy of Medical Intents via LLM-based Multi-Agent Collaboration", "authors": ["Xian Gao", "Jiacheng Ruan"], "abstract": "In healthcare intelligence, the ability to fuse heterogeneous, multi-intent information...", "published": "2024-10-16T13:10:27Z", "pdf_url": "https://arxiv.org/pdf/2410.12532v3"}
```

## openalex_search.py

```sh
python3 scripts/openalex_search.py --query "LLM clinical agents" [--max 15] [--from-year 2022]
```

- `--query` (required): full-text search.
- `--max` (default 15): per-page result count.
- `--from-year` (optional): filter `from_publication_date:<Y>-01-01`.

Output schema per line: `{"source":"openalex", "id", "doi", "title", "authors":[...], "year", "venue", "cited_by", "abstract", "oa_pdf_url"}`. Any field may be `null` when OpenAlex lacks it; `abstract` is `""` when the inverted index is missing (abstracts are reconstructed from `abstract_inverted_index`).

Sample line:

```json
{"source": "openalex", "id": "https://openalex.org/W4386963671", "doi": "https://doi.org/10.48550/arxiv.2308.08155", "title": "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation", "authors": ["Qingyun Wu", "Gagan Bansal"], "year": 2023, "venue": "arXiv", "cited_by": 412, "abstract": "AutoGen is an open-source framework that allows developers to build LLM applications...", "oa_pdf_url": "https://arxiv.org/pdf/2308.08155"}
```

## fetch_paper.py

```sh
python3 scripts/fetch_paper.py --url https://arxiv.org/pdf/2308.08155 --out papers/autogen.pdf
```

Downloads with an honest UA header, follows redirects, requires HTTP 200 and >10KB, creates parent dirs, prints `saved <path> (<n> bytes)`. Nonzero exit + stderr message otherwise. Only pass open-access URLs (`pdf_url` from arXiv, `oa_pdf_url` from OpenAlex); skip records where the URL is null.

## local_library.py

Local PDF corpus support — fully offline, no network. Records merge with arxiv/openalex candidates via the same dedupe recipe below.

```sh
python3 scripts/local_library.py scan --dir ~/Research/Papers [--max 10]
python3 scripts/local_library.py extract --path ~/Research/Papers/paper.pdf [--max-chars 200000]
```

- `scan --dir DIR [--max N]`: one JSON line per `*.pdf` in DIR (non-recursive, sorted by filename). Schema: `{"source":"local", "id":<filename slug>, "path", "title", "authors", "year", "doi", "abstract", "pages"}`. Title prefers PDF metadata `/Title` when it looks like a real title, else the first plausible title line of page 1, else the de-slugified filename. Abstract is the text between an `Abstract` heading (or a structured `Background:`/`Objective:` start) and the next section heading, capped at 4000 chars. DOI is the first `10.\d{4,9}/...` match in the first 3 pages.
- `extract --path FILE [--max-chars N]`: full extracted text of one PDF (default cap 200000 chars) as `{"source":"local", "path", "chars", "truncated", "text"}` — use for full-text (`stage=fulltext`) screening.

**Extraction chain** — first that works: `pdftotext` (poppler) if on PATH, then PyMuPDF (`import fitz`) if importable, then a built-in stdlib fallback that reads the PDF `/Title` metadata and returns an empty abstract. Optional tools are detected, never required. A scan NEVER crashes on a bad PDF: each file gets a 60s subprocess timeout, and an unparseable file still emits its record with whatever fields resolved plus an `"extract_error"` field.

## Rate limiting & retries

All network calls share `scripts/_http.py`: up to 4 attempts on HTTP 429/500/502/503/504 and on timeouts, exponential backoff 3s/9s/27s (capped 60s), honoring a numeric `Retry-After` header. Retry notices go to stderr; stdout stays pure JSON lines. `arxiv_search.py` additionally enforces >=3s between arXiv requests in one process (arXiv's guidance is ~1 request per 3s).

Set `OPENALEX_MAILTO=you@example.org` to join OpenAlex's polite pool (appends `mailto:` to the User-Agent). Unset means no mailto is sent.

## Failure modes

- HTTP failure (network down, rate limit, API 5xx): retried automatically as above; after exhausting retries the script exits 1 with a stderr message naming the status code. Note the outage and continue with the other source.
- Empty result set: valid — the query matched nothing; broaden the query.
- fetch_paper "response too small": the URL served an HTML landing page, not a PDF; skip it.

## Dedupe recipe

Records from different sources overlap (including local PDFs of papers also on arXiv/OpenAlex). Normalize each title — lowercase, strip all non-alphanumeric characters — and treat records with equal normalized titles as duplicates. Keep one record per title, preferring the one with a DOI (usually the OpenAlex record); merge in the arXiv `pdf_url` if the kept record lacks an OA URL, and carry over a local record's `path` so full text stays reachable offline.
