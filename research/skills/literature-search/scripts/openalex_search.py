#!/usr/bin/env python3
"""Search OpenAlex works (keyless). One JSON object per line."""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = "research-harness/0.1 (personal research tool)"


def reconstruct_abstract(inv_index):
    if not inv_index:
        return ""
    words = {}
    for word, positions in inv_index.items():
        for pos in positions:
            words[pos] = word
    return " ".join(words[i] for i in sorted(words))


def main():
    ap = argparse.ArgumentParser(description="Search OpenAlex, emit JSON lines.")
    ap.add_argument("--query", required=True)
    ap.add_argument("--max", type=int, default=15)
    ap.add_argument("--from-year", type=int, help="only works published from this year")
    args = ap.parse_args()

    params = {
        "search": args.query,
        "per-page": args.max,
        "sort": "relevance_score:desc",
    }
    if args.from_year:
        params["filter"] = f"from_publication_date:{args.from_year}-01-01"
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"openalex_search: HTTP failure: {e}", file=sys.stderr)
        sys.exit(1)

    for work in data.get("results", []):
        loc = work.get("primary_location") or {}
        src = loc.get("source") or {}
        best_oa = work.get("best_oa_location") or {}
        oa = work.get("open_access") or {}
        rec = {
            "source": "openalex",
            "id": work.get("id"),
            "doi": work.get("doi"),
            "title": work.get("title"),
            "authors": [
                (a.get("author") or {}).get("display_name")
                for a in work.get("authorships", [])
            ],
            "year": work.get("publication_year"),
            "venue": src.get("display_name"),
            "cited_by": work.get("cited_by_count"),
            "abstract": reconstruct_abstract(work.get("abstract_inverted_index")),
            "oa_pdf_url": best_oa.get("pdf_url") or oa.get("oa_url"),
        }
        print(json.dumps(rec, ensure_ascii=False))


if __name__ == "__main__":
    main()
