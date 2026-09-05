---
name: literature-search
description: "Use when searching academic literature. Search arXiv/OpenAlex, fetch open-access PDFs."
---

# literature-search

Three python3-stdlib CLI scripts under `scripts/` (relative to this SKILL.md). Keyless APIs only: arXiv Atom export API and api.openalex.org. All emit one JSON object per line on stdout; errors go to stderr with exit 1.

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

## Rate limiting & retries

All network calls share `scripts/_http.py`: up to 4 attempts on HTTP 429/500/502/503/504 and on timeouts, exponential backoff 3s/9s/27s (capped 60s), honoring a numeric `Retry-After` header. Retry notices go to stderr; stdout stays pure JSON lines. `arxiv_search.py` additionally enforces >=3s between arXiv requests in one process (arXiv's guidance is ~1 request per 3s).

Set `OPENALEX_MAILTO=you@example.org` to join OpenAlex's polite pool (appends `mailto:` to the User-Agent). Unset means no mailto is sent.

## Failure modes

- HTTP failure (network down, rate limit, API 5xx): retried automatically as above; after exhausting retries the script exits 1 with a stderr message naming the status code. Note the outage and continue with the other source.
- Empty result set: valid — the query matched nothing; broaden the query.
- fetch_paper "response too small": the URL served an HTML landing page, not a PDF; skip it.

## Dedupe recipe

Records from both sources overlap. Normalize each title — lowercase, strip all non-alphanumeric characters — and treat records with equal normalized titles as duplicates. Keep one record per title, preferring the one with a DOI (usually the OpenAlex record); merge in the arXiv `pdf_url` if the kept record lacks an OA URL.
