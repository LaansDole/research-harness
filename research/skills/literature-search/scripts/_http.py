"""Shared stdlib HTTP with rate-limit-aware retries (GET, or POST with `data`).

Retries HTTP 429/500/502/503/504 and socket/URL timeouts up to 4 attempts
with exponential backoff (3s, 9s, 27s, capped at 60s), honoring a numeric
Retry-After header. Retry notices go to stderr only. Non-retryable errors
and exhausted retries re-raise the last exception.
"""
import sys
import time
import urllib.error
import urllib.request

RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 4
BACKOFF_CAP = 60.0

_last_request = 0.0


def fetch(url, user_agent, timeout=30, min_interval=0.0, data=None,
          content_type="application/json", attempts=MAX_ATTEMPTS):
    """Request url and return the response body bytes; `data` bytes make it a POST.

    `attempts=1` disables the retry ladder - right for liveness probes, where a
    refused connection is the answer, not a transient failure."""
    global _last_request
    headers = {"User-Agent": user_agent}
    if data is not None:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers)
    last_err = None
    for attempt in range(attempts):
        if min_interval:
            wait = _last_request + min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
        _last_request = time.monotonic()
        retry_after = None
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code not in RETRY_STATUSES:
                raise
            last_err = e
            retry_after = e.headers.get("Retry-After")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
        if attempt == attempts - 1:
            break
        delay = min(3.0 * 3**attempt, BACKOFF_CAP)
        if retry_after:
            try:
                delay = min(max(delay, float(retry_after)), BACKOFF_CAP)
            except ValueError:
                pass
        print(
            f"_http: {last_err}; retry {attempt + 1}/{attempts - 1} "
            f"in {delay:.0f}s: {url}",
            file=sys.stderr,
        )
        time.sleep(delay)
    raise last_err
