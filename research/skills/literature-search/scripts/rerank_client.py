"""Local cross-encoder reranker client (llama-server --reranking), stdlib only.

Off unless RERANK_URL is set (env, else a RERANK_URL= line in config.env).
Loopback-only unless RERANK_ALLOW_REMOTE=1: the server is an unauthenticated
local process, so pointing it at a remote host must be a deliberate act.

Documents are batched to fit the server context (chars/4 estimate); results are
remapped back to global document indices. A document that cannot fit alone is
truncated and reported, never dropped or silently shortened. Notices go to
stderr; retries/backoff come from _http.
"""
import hashlib
import json
import os
import pathlib
import sys
import typing
import urllib.error
import urllib.parse

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
import _http  # noqa: E402

DEFAULT_URL = "http://127.0.0.1:8091"
CONFIG_ENV = pathlib.Path.home() / ".research-harness" / "config.env"
USER_AGENT = "research-harness-rerank/1.0"
TOKEN_BUDGET = 6000
CHARS_PER_TOKEN = 4
LOOPBACK = frozenset({"127.0.0.1", "localhost", "::1", "[::1]"})


class RerankError(Exception):
    """Base error: misconfiguration the caller must fix (bad URL, bad budget)."""


class RerankUnavailable(RerankError):
    """The server is not reachable - the optional feature stays off."""


class RerankProtocolError(RerankError):
    """The server answered with something that is not a rerank response."""


class RerankScores(typing.NamedTuple):
    results: list  # [(global document index, score)] sorted by score desc
    model: str
    truncated: list  # global indices whose text was cut to fit the context
    prompt_tokens: int


def resolve_url(config_path=None):
    """Server URL from RERANK_URL, else a RERANK_URL= line in config.env."""
    url = os.environ.get("RERANK_URL")
    if url:
        return url.strip()
    path = pathlib.Path(config_path) if config_path else CONFIG_ENV
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    for line in text.splitlines():
        key, _, value = line.partition("=")
        if key.strip() == "RERANK_URL":
            return value.strip().strip('"').strip("'") or None
    return None


def check_url(url):
    """Refuse a non-loopback server unless RERANK_ALLOW_REMOTE=1."""
    host = urllib.parse.urlsplit(url).hostname or ""
    if host in LOOPBACK or os.environ.get("RERANK_ALLOW_REMOTE") == "1":
        return url.rstrip("/")
    raise RerankError(
        f"rerank_client: refusing non-loopback server {url!r}"
        " (set RERANK_ALLOW_REMOTE=1 to allow it)")


def criteria_hash(criteria, mode):
    """Identity of a scoring run: the criteria text plus the aggregation mode.

    Shared by the writer (rerank_screen) and the reader (review.py next
    --order relevance) so edited criteria retire their scores instead of
    silently reordering against a stale question."""
    canonical = json.dumps(criteria, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(f"{canonical}|{mode}".encode()).hexdigest()


def est_tokens(text):
    return max(1, len(text) // CHARS_PER_TOKEN)


def plan_batches(query, docs, budget):
    """(batches, truncated): batches of (index, text) fitting the token budget."""
    room = budget - est_tokens(query)
    if room < 16:
        raise RerankError(f"rerank_client: query needs more than the {budget}-token budget")
    max_chars = room * CHARS_PER_TOKEN
    batches, truncated, current, used = [], [], [], 0
    for i, doc in enumerate(docs):
        text = doc
        if est_tokens(text) > room:
            text = text[:max_chars]
            truncated.append(i)
            print(f"rerank_client: document {i} truncated to {max_chars} chars"
                  f" to fit the {budget}-token context", file=sys.stderr)
        cost = est_tokens(text)
        if current and used + cost > room:
            batches.append(current)
            current, used = [], 0
        current.append((i, text))
        used += cost
    if current:
        batches.append(current)
    return batches, truncated


def _post(url, payload, timeout):
    try:
        raw = _http.fetch(url, USER_AGENT, timeout=timeout,
                          data=json.dumps(payload).encode())
    except urllib.error.HTTPError as err:
        raise RerankUnavailable(f"rerank server returned HTTP {err.code}: {url}") from err
    except (OSError, urllib.error.URLError) as err:
        raise RerankUnavailable(f"rerank server unreachable at {url}: {err}") from err
    try:
        body = json.loads(raw)
        results = body["results"]
        return body, [(int(r["index"]), float(r["relevance_score"])) for r in results]
    except (ValueError, KeyError, TypeError) as err:
        raise RerankProtocolError(f"unexpected rerank response from {url}: {err}") from err


def health(url, timeout=5):
    """True when the server answers GET /health with status ok.

    One attempt, no backoff: `research doctor` and `rerank status` must answer
    immediately when nothing is listening."""
    try:
        body = json.loads(_http.fetch(check_url(url) + "/health", USER_AGENT,
                                      timeout=timeout, attempts=1))
    except (OSError, ValueError, urllib.error.URLError, RerankError):
        return False
    return body.get("status") == "ok"


def rerank(url, query, docs, top_n=None, budget=TOKEN_BUDGET, timeout=300):
    """Score every document against query. Returns RerankScores (desc by score)."""
    url = check_url(url)
    if not docs:
        return RerankScores([], "", [], 0)
    batches, truncated = plan_batches(query, docs, budget)
    scored, model, tokens = [], "", 0
    for batch in batches:
        body, pairs = _post(url + "/v1/rerank",
                            {"query": query, "documents": [t for _, t in batch]}, timeout)
        model = body.get("model") or model
        tokens += int(body.get("usage", {}).get("prompt_tokens") or 0)
        for local, score in pairs:
            if not 0 <= local < len(batch):
                raise RerankProtocolError(
                    f"rerank server returned index {local} for a {len(batch)}-document batch")
            scored.append((batch[local][0], score))
    scored.sort(key=lambda pair: (-pair[1], pair[0]))
    return RerankScores(scored[:top_n] if top_n else scored, model, truncated, tokens)
