#!/usr/bin/env python3
"""Download an open-access PDF. Requires HTTP 200 and >10KB."""
import argparse
import os
import pathlib
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _http

UA = "research-harness/0.1 (personal research tool)"
MIN_BYTES = 10 * 1024


def main():
    ap = argparse.ArgumentParser(description="Fetch an open-access paper PDF.")
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    try:
        # urlopen follows redirects by default.
        body = _http.fetch(args.url, UA, timeout=60)
    except urllib.error.HTTPError as e:
        print(f"fetch_paper: HTTP {e.code} after retries for {args.url}", file=sys.stderr)
        sys.exit(1)
    except (urllib.error.URLError, OSError) as e:
        print(f"fetch_paper: HTTP failure after retries: {e}", file=sys.stderr)
        sys.exit(1)

    if len(body) <= MIN_BYTES:
        print(
            f"fetch_paper: response too small ({len(body)} bytes <= {MIN_BYTES}); "
            "probably not a PDF",
            file=sys.stderr,
        )
        sys.exit(1)

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(body)
    print(f"saved {out} ({len(body)} bytes)")


if __name__ == "__main__":
    main()
