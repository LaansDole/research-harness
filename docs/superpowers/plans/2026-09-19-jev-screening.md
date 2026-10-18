# Jev First-Pass Screening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-subagent-driven-development (recommended) or superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional Jev (TypeSafe System One) first pass at title/abstract screening: auto-decide clear include/exclude bands into the existing review store, leave uncertain records untouched.

**Architecture:** Two new stdlib scripts beside `_http.py` (`jev_client.py` HTTP+retry, `jev_screen.py` bands+aggregation) writing verdicts ONLY through the existing `review.py verdict` CLI; skill + doctor + prompt/mode paragraphs; everything additive under `research/`.

**Tech Stack:** Python 3.10+ stdlib only (urllib, unittest, sqlite via existing review.py). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-jev-screening-design.md` (read it first — contracts, mermaid design, non-goals).

**Hard rules for every task:** Work on branch `feat/jev-firstpass` (Task 1 creates it off main). Never touch `packages/`, `crates/`, root package.json, lockfiles, `config.yml`. Never print API key material. Suite gate after every task: `bash research/tests/run.sh` (baseline 91 tests, 1 skipped — green or fix before moving on). Commit locally per task. ASCII hyphens only in all files (repo typography rule). No `/Users/` absolute paths in shipped files.

---

### Task 1: Branch + `jev_client.py` with offline tests

**Files:**
- Create: `research/skills/literature-search/scripts/jev_client.py`
- Create: `research/tests/test_jev_client.py`

- [ ] **Step 1: Create the branch**

```bash
cd ~/Projects/research-harness && git checkout -b feat/jev-firstpass main
```

- [ ] **Step 2: Write the failing tests**

```python
"""Offline tests for the Jev client: request shape, errors, retries, key resolution."""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "skills", "literature-search", "scripts"))
import jev_client  # noqa: E402


def _resp(payload, status=200, headers=None):
    body = json.dumps(payload).encode()
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    if status == 200:
        return io.BytesIO(body)
    err = jev_client.urllib.error.HTTPError("https://api.typesafe.ai/v1/systemone", status,
                                           "err", h, io.BytesIO(body))
    return err


class ResolveKeyTest(unittest.TestCase):
    def test_env_wins_over_config(self):
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "envkey"}):
            with mock.patch("pathlib.Path.exists", return_value=True):
                self.assertEqual(jev_client.resolve_key("/tmp/nonexistent"), "envkey")

    def test_none_when_absent(self):
        env = {k: v for k, v in os.environ.items() if k != "TYPESAFE_API_KEY"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertIsNone(jev_client.resolve_key("/tmp/definitely-not-here-config.env"))


class FanOutTest(unittest.TestCase):
    def test_sends_bearer_and_returns_answers(self):
        seen = {}

        def fake_urlopen(req, timeout=90):
            seen["auth"] = req.get_header("Authorization")
            seen["body"] = json.loads(req.data.decode())
            return _resp({"model": "jev-1.13.0", "answers": {"a": {"type": "noul", "noul": 0.9}}})

        with mock.patch.object(jev_client.urllib.request, "urlopen", fake_urlopen):
            out = jev_client.fan_out("state text", {"a": {"type": "noul", "instructions": "ok?"}}, "k1")
        self.assertEqual(seen["auth"], "Bearer k1")
        self.assertEqual(seen["body"]["model"], "jev-latest")
        self.assertEqual(out["answers"]["a"]["noul"], 0.9)

    def test_usage_error_400_raises_jev_usage_error(self):
        with mock.patch.object(jev_client.urllib.request, "urlopen",
                               lambda req, timeout=90: _resp({"detail": {"error_type": "api_usage_error", "message": "Unknown model: x"}}, 400)):
            with self.assertRaises(jev_client.JevUsageError):
                jev_client.fan_out("s", {"a": {"type": "noul", "instructions": "ok?"}}, "k1")

    def test_auth_error_401_raises_jev_auth_error(self):
        with mock.patch.object(jev_client.urllib.request, "urlopen",
                               lambda req, timeout=90: _resp({"detail": "bad key"}, 401)):
            with self.assertRaises(jev_client.JevAuthError):
                jev_client.fan_out("s", {"a": {"type": "noul", "instructions": "ok?"}}, "k1")

    def test_429_retries_then_succeeds(self):
        calls = {"n": 0}

        def flaky(req, timeout=90):
            calls["n"] += 1
            if calls["n"] < 3:
                return _resp({"detail": "slow down"}, 429, {"Retry-After": "0"})
            return _resp({"model": "m", "answers": {}})

        with mock.patch.object(jev_client.urllib.request, "urlopen", flaky), \
                mock.patch.object(jev_client.time, "sleep"):
            out = jev_client.fan_out("s", {"a": {"type": "noul", "instructions": "ok?"}}, "k1")
        self.assertEqual(calls["n"], 3)
        self.assertEqual(out["model"], "m")


class ListModelsTest(unittest.TestCase):
    def test_returns_model_names(self):
        payload = {"models": [{"name": "jev-latest"}, {"name": "jev-preview"}]}
        with mock.patch.object(jev_client.urllib.request, "urlopen", lambda req, timeout=30: _resp(payload)):
            self.assertEqual(jev_client.list_models("k1"), ["jev-latest", "jev-preview"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2b: Run the tests to see them fail**

Run: `python3 -m unittest research.tests.test_jev_client -v` (or `python3 -m unittest discover -s research/tests -p 'test_jev_client.py' -v`)
Expected: FAIL/ERROR — `jev_client` does not exist yet.

- [ ] **Step 3: Implement `jev_client.py`**

```python
"""TypeSafe Jev (System One) client - stdlib HTTP, rate-limit-aware retries.

One endpoint: POST https://api.typesafe.ai/v1/systemone with {state, model,
questions}; answers come back as typed Noul/Choice/Score distributions.
Retries 429/5xx/timeouts up to 4 attempts with exponential backoff honoring
numeric Retry-After; notices go to stderr only so stdout stays parseable.
The API key is resolved from TYPESAFE_API_KEY or ~/.research-harness/config.env
and is never printed or stored.
"""
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

API_URL = "https://api.typesafe.ai/v1/systemone"
MODELS_URL = "https://api.typesafe.ai/v1/models"
CONFIG_ENV = pathlib.Path.home() / ".research-harness" / "config.env"
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 4
BACKOFF_CAP = 60.0


class JevError(Exception):
    """Base error for Jev API failures."""


class JevUsageError(JevError):
    """400/422 - the request itself is invalid (model, questions, schema)."""


class JevAuthError(JevError):
    """401/403 - missing or rejected API key."""


def resolve_key(explicit=None):
    """API key from argument, TYPESAFE_API_KEY, or ~/.research-harness/config.env."""
    if explicit:
        return explicit
    env = os.environ.get("TYPESAFE_API_KEY")
    if env:
        return env
    if CONFIG_ENV.exists():
        for line in CONFIG_ENV.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("TYPESAFE_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return None


def _post(url, payload, api_key, timeout):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    last_err = None
    for attempt in range(MAX_ATTEMPTS):
        retry_after = None
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read()
            if e.code in (400, 422):
                raise JevUsageError(_detail(body)) from None
            if e.code in (401, 403):
                raise JevAuthError(f"Jev rejected the API key (HTTP {e.code})") from None
            if e.code not in RETRY_STATUSES:
                raise JevError(f"Jev API HTTP {e.code}: {_detail(body)[:200]}") from None
            last_err = e
            retry_after = e.headers.get("Retry-After")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
        if attempt == MAX_ATTEMPTS - 1:
            break
        delay = min(3.0 * 3 ** attempt, BACKOFF_CAP)
        if retry_after:
            try:
                delay = min(max(delay, float(retry_after)), BACKOFF_CAP)
            except ValueError:
                pass
        print(f"jev_client: {last_err}; retry {attempt + 1}/{MAX_ATTEMPTS - 1} in {delay:.0f}s",
              file=sys.stderr)
        time.sleep(delay)
    raise JevError(f"Jev API unreachable after {MAX_ATTEMPTS} attempts: {last_err}")


def _detail(body_bytes):
    try:
        d = json.loads(body_bytes)
        detail = d.get("detail", d)
        if isinstance(detail, dict):
            return detail.get("message") or json.dumps(detail)
        return str(detail)
    except Exception:
        return (body_bytes or b"").decode(errors="replace")


def fan_out(state, questions, api_key, model="jev-latest", timeout=90):
    """One call, many questions. Returns the parsed response dict (has 'answers' and 'model')."""
    return _post(API_URL, {"state": state, "model": model, "questions": questions}, api_key, timeout)


def list_models(api_key, timeout=30):
    """GET /v1/models -> list of model names (used by research doctor)."""
    req = urllib.request.Request(MODELS_URL, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return [m["name"] for m in json.loads(resp.read())["models"]]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s research/tests -p 'test_jev_client.py' -v` then `bash research/tests/run.sh`
Expected: new tests PASS, full suite 91+new green.

- [ ] **Step 5: Commit**

```bash
git add research/skills/literature-search/scripts/jev_client.py research/tests/test_jev_client.py
git commit -m "feat(research): jev_client - stdlib TypeSafe System One client with retries"
```

### Task 2: `jev_screen.py` first-pass screening + integration tests

**Files:**
- Create: `research/skills/literature-search/scripts/jev_screen.py`
- Create: `research/tests/test_jev_screen.py`

- [ ] **Step 1: Write the failing tests**

```python
"""Offline integration tests for jev_screen: bands, verdicts, skips, no-key."""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "literature-search", "scripts")
sys.path.insert(0, SCRIPTS)
import jev_screen  # noqa: E402
import review  # noqa: E402  (same store module the script shells out to)


def make_project(tmp):
    proj = os.path.join(tmp, "proj1")
    os.makedirs(proj, exist_ok=True)
    db = os.path.join(proj, "review.db")
    rows = [
        ("10.1000/a1", "Clear include paper about our population and concept", "We study EXACTLY the population described, applying the concept in the required context, with strong methods."),
        ("10.1000/e1", "Off-topic paper on soil bacteria", "This paper studies soil microbiomes; nothing related to the review question."),
        ("10.1000/m1", "Ambiguous middle-band paper", "It mentions adjacent topics and one cannot tell whether the population matches."),
        ("10.1000/n1", "No abstract paper", None),
    ]
    for doi, title, abstract in rows:
        ris = f"""TY  - JOUR
DO  - {doi}
TI  - {title}
AB  - {abstract or ""}
ER  - """
        p = os.path.join(tmp, "in.ris")
        with open(p, "a", encoding="utf-8") as f:
            f.write(ris + "\n")
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = review.main(["--project", proj, "import", p])
            assert rc == 0, buf.getvalue()
    with open(os.path.join(proj, "criteria.json"), "w", encoding="utf-8") as f:
        json.dump({"population": "Adults in emergency care", "concept": "LLM triage support"}, f)
    return proj, db


def patch_jev(probs_by_doi, reason_by_doi=None):
    """Monkeypatch jev_screen.jev_call to return chosen probabilities per record."""
    reason_by_doi = reason_by_doi or {}

    def fake_call(state, questions, api_key, model):
        doi = [l.split(":", 1)[1].strip() for l in state.splitlines() if l.startswith("doi:")][0]
        probs = probs_by_doi[doi]
        answers = {k: {"type": "noul", "noul": p} for k, p in probs.items()}
        if "primary_reason" in questions:
            answers["primary_reason"] = {"type": "choice", "choice": reason_by_doi.get(doi, "population"),
                                         "probabilities": {}, "confidence": 1.0}
        return {"model": "jev-1.13.0", "answers": answers}
    return fake_call


class JevScreenTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.proj, self.db = make_project(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def run_screen(self, *extra):
        out = io.StringIO(); err = io.StringIO()
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "k1"}), \
                mock.patch.object(jev_screen, "jev_call", patch_jev({
                    "10.1000/a1": {"population": 0.97, "concept": 0.95},
                    "10.1000/e1": {"population": 0.02, "concept": 0.03},
                    "10.1000/m1": {"population": 0.55, "concept": 0.60},
                }), reason_by_doi={"10.1000/e1": "population"}), \
                redirect_stdout(out), redirect_stderr(err):
            rc = jev_screen.main(["--project", self.proj, "--criteria",
                                  os.path.join(self.proj, "criteria.json"), *extra])
        return rc, out.getvalue(), err.getvalue()

    def test_verdicts_landed_with_provenance(self):
        rc, out, _ = self.run_screen()
        self.assertEqual(rc, 0)
        con = review.connect(self.db)
        inc = review.get_record(con, "10.1000/a1")
        exc = review.get_record(con, "10.1000/e1")
        self.assertEqual(inc["state"], "screened_included")
        self.assertIn("[jev-1.13.0 p=0.95]", inc["rationale"])
        self.assertEqual(exc["state"], "screened_excluded")
        self.assertEqual(exc["reason"], "population")

    def test_middle_band_untouched(self):
        rc, out, _ = self.run_screen()
        con = review.connect(self.db)
        mid = review.get_record(con, "10.1000/m1")
        self.assertEqual(mid["state"], "identified")

    def test_no_abstract_skipped_not_judged(self):
        rc, out, _ = self.run_screen()
        con = review.connect(self.db)
        self.assertEqual(review.get_record(con, "10.1000/n1")["state"], "identified")
        self.assertIn("no-abstract", out)

    def test_regression_band_edges(self):
        # exactly at T_INCLUDE must include; exactly at 1-T_EXCLUDE must exclude;
        # one step inside each band must match too.
        cases = [("0.90", "screened_included"), ("0.10", "screened_excluded"),
                 ("0.899", "identified"), ("0.101", "identified")]
        for p, expected in cases:
            proj, db = make_project(tempfile.mkdtemp())
            with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "k1"}), \
                    mock.patch.object(jev_screen, "jev_call", patch_jev({
                        "10.1000/a1": {"population": float(p), "concept": float(p)},
                        "10.1000/e1": {"population": float(p), "concept": float(p)},
                        "10.1000/m1": {"population": float(p), "concept": float(p)},
                    })), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                rc = jev_screen.main(["--project", proj, "--criteria", os.path.join(proj, "criteria.json")])
                self.assertEqual(rc, 0)
            con = review.connect(db)
            got = review.get_record(con, "10.1000/a1")["state"]
            self.assertEqual(got, expected, f"min_p={p} -> {expected}")

    def test_regression_exclude_names_argmin_reason(self):
        # lowest criterion probability must become the exclusion reason
        proj, db = make_project(tempfile.mkdtemp())
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "k1"}), \
                mock.patch.object(jev_screen, "jev_call", patch_jev({
                    "10.1000/e1": {"population": 0.40, "concept": 0.01},
                }), reason_by_doi={"10.1000/e1": "concept"}), \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            jev_screen.main(["--project", proj, "--criteria", os.path.join(proj, "criteria.json")])
        con = review.connect(db)
        self.assertEqual(review.get_record(con, "10.1000/e1")["reason"], "concept")

    def test_no_key_is_silent_success(self):
        out = io.StringIO(); err = io.StringIO()
        env = {k: v for k, v in os.environ.items() if k != "TYPESAFE_API_KEY"}
        with mock.patch.dict(os.environ, env, clear=True), \
                redirect_stdout(out), redirect_stderr(err):
            rc = jev_screen.main(["--project", self.proj, "--criteria",
                                  os.path.join(self.proj, "criteria.json")])
        self.assertEqual(rc, 0)
        self.assertIn("OFF", err.getvalue())


if __name__ == "__main__":
    unittest.main()
```

NOTE: adjust the `review`-module touch points to what the module actually exports (`connect`, `get_record`, `main`, or their real names) — read `review.py` first and use its real functions; the test above is written against the documented CLI behavior (`--project`, `import`, `verdict --confidence` float) and the store's public helpers. Do NOT weaken the assertions: verdicts land with `[jev-...]` provenance, middle band stays `identified`, no-abstract skipped, band edges exact, argmin reason, no-key exit 0.

- [ ] **Step 2b: Run to see them fail**

Run: `python3 -m unittest discover -s research/tests -p 'test_jev_screen.py' -v`
Expected: FAIL/ERROR — `jev_screen` does not exist.

- [ ] **Step 3: Implement `jev_screen.py`**

```python
"""Jev first-pass title/abstract screening into the review store.

For each un-screened record with an abstract: ONE fan-out call with a Noul
per criterion plus a speculative Choice over exclusion reasons. Records in
the clear bands (>= T_INCLUDE or <= 1 - T_EXCLUDE on the minimum criterion
probability) get normal review.py verdicts with a [jev-<model> p=...] provenance
prefix; everything in between stays untouched for the LLM screener.
No API key -> notice on stderr and exit 0 (feature is optional).
"""
import argparse
import json
import os
import subprocess
import sys

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS)
import jev_client  # noqa: E402

HERE = SCRIPTS
REVIEW = os.path.join(HERE, "review.py")
DEFAULT_INCLUDE = 0.90
DEFAULT_EXCLUDE = 0.10


def jev_call(state, questions, api_key, model):
    """Indirection so tests can monkeypatch the network boundary."""
    return jev_client.fan_out(state, questions, api_key, model=model)


def run_review(args, input_text=None):
    cmd = [sys.executable, REVIEW] + args
    return subprocess.run(cmd, input=input_text, capture_output=True, text=True)


def build_state(rec):
    return json.dumps({"doi": rec.get("doi") or "", "title": rec["title"],
                       "abstract": rec.get("abstract") or ""}, ensure_ascii=False)


def build_questions(criteria):
    qs = {k: {"type": "noul", "instructions":
              f"Does this record meet the '{k}' criterion: {text}?"}
          for k, text in criteria.items()}
    qs["primary_reason"] = {"type": "choice",
                            "instructions": "If the record must be EXCLUDED, which single criterion is the primary reason?",
                            "criteria": {k: text for k, text in criteria.items()}}
    return qs


def decide(probs, t_include, t_exclude):
    """(verdict|None, min_key, min_p) - None means middle band, leave untouched."""
    min_key = min(probs, key=probs.get)
    min_p = probs[min_key]
    if min_p >= t_include:
        return "include", min_key, min_p
    if min_p <= 1.0 - t_exclude:
        return "exclude", min_key, min_p
    return None, min_key, min_p


def parse_thresholds(s):
    out = {}
    for part in s.split(","):
        k, v = part.split("=")
        out[k.strip()] = float(v)
    if "include" not in out or "exclude" not in out:
        raise SystemExit("--thresholds needs include=.. and exclude=..")
    return out["include"], out["exclude"]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Jev first-pass T/A screening")
    ap.add_argument("--project", required=True)
    ap.add_argument("--criteria", required=True, help="criteria.json path")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--thresholds", default=f"include={DEFAULT_INCLUDE},exclude={DEFAULT_EXCLUDE}")
    ap.add_argument("--model", default="jev-latest")
    args = ap.parse_args(argv)

    api_key = jev_client.resolve_key()
    if not api_key:
        print("jev_screen: Jev first-pass OFF (no TYPESAFE_API_KEY)", file=sys.stderr)
        return 0
    with open(args.criteria, encoding="utf-8") as f:
        criteria = {k: v for k, v in json.load(f).items() if k != "primary_reason"}
    t_include, t_exclude = parse_thresholds(args.thresholds)
    cap = int(os.environ.get("JEV_MAX_RECORDS", "200"))
    limit = min(args.limit, cap) if args.limit else cap

    cmd = ["next", "--stage", "ta"]
    if limit:
        cmd += ["--limit", str(limit)]
    r = run_review(["--project", args.project] + cmd)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        return r.returncode
    records = [json.loads(l) for l in r.stdout.splitlines() if l.strip()]

    judged = skipped = 0
    for rec in records:
        abstract = (rec.get("abstract") or "").strip()
        if not abstract:
            skipped += 1
            print(f"jev_screen: skip no-abstract {rec['id']}", file=sys.stderr)
            continue
        resp = jev_call(build_state(rec), build_questions(criteria), api_key, args.model)
        model_id = resp.get("model", "unknown")
        probs = {k: resp["answers"][k]["noul"] for k in criteria}
        verdict, min_key, min_p = decide(probs, t_include, t_exclude)
        if verdict is None:
            continue
        prob_line = ", ".join(f"{k}={probs[k]:.2f}" for k in sorted(probs))
        rationale = f"[jev-{model_id} p={min_p:.2f}] {verdict} on criterion '{min_key}' ({prob_line})"
        vcmd = ["--project", args.project, "verdict", "--id", rec["id"], "--stage", "ta",
                "--verdict", verdict, "--rationale", rationale,
                "--confidence", f"{min_p:.4f}"]
        if verdict == "exclude":
            vcmd += ["--reason", min_key]
        if args.dry_run:
            print(f"jev_screen (dry-run): {rec['id']} -> {verdict} ({rationale})")
        else:
            vr = run_review(vcmd)
            if vr.returncode != 0:
                print(f"jev_screen: verdict failed for {rec['id']}: {vr.stderr.strip()}",
                      file=sys.stderr)
                continue
        judged += 1
    print(f"jev_screen: judged={judged} skipped_no_abstract={skipped} "
          f"(bands include>={t_include} exclude<={1.0 - t_exclude:.2f} on min_p)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Notes for the implementer: `review.py next --stage ta --limit N` prints JSON lines of unscreened records (state=identified) — verify the exact output shape by reading `review.py cmd_next` and adjust field names (`id`, `title`, `abstract`, `doi`). If `next` has no `--limit`, fetch all and slice in Python. Keep `verdict` calls via subprocess (contract = the CLI, not the module internals). Verify `--confidence 0.9500` maps to HIGH/MEDIUM per review.py's float-mapping before finalizing.

- [ ] **Step 4: Run tests + suite**

Run: `python3 -m unittest discover -s research/tests -p 'test_jev_screen.py' -v` then `bash research/tests/run.sh`
Expected: new tests PASS (including both regression tests), full suite green.

- [ ] **Step 5: Mutation check (required)**

Introduce the classic off-by-one: in `decide()`, change `min_p >= t_include` to `min_p > t_include`.
Run: `python3 -m unittest discover -s research/tests -p 'test_jev_screen.py'`
Expected: `test_regression_band_edges` FAILS. Revert; suite green again; `git diff` empty afterward.

- [ ] **Step 6: Commit**

```bash
git add research/skills/literature-search/scripts/jev_screen.py research/tests/test_jev_screen.py
git commit -m "feat(research): jev_screen - banded first-pass T/A screening via review.py verdicts"
```

### Task 3: Live-key smoke (verification, not a committed test)

**Files:** none committed.

- [ ] **Step 1: Build a 3-record temp project** (reuse the RIS fixture pattern from Task 2) in a temp dir; `review.py import` them; write a small criteria.json about a topic the fixture titles clearly match/mismatch.
- [ ] **Step 2: Run against the live API** with `TYPESAFE_API_KEY` from the environment (set by the coordinator; never echo it): `python3 research/skills/literature-search/scripts/jev_screen.py --project <tmpdir> --criteria <tmpdir>/criteria.json --limit 3`
Expected: exit 0; stderr/stdout shows judged/skipped counts; `review.py stats` shows the banded verdicts; NO key material anywhere in output.
- [ ] **Step 3: Check the versioned model** — at least one rationale contains `[jev-1.` and the resolved id is logged.
- [ ] **Step 4: Report the measured per-record latency and token totals** (from responses) in the exit summary; do not commit them.

### Task 4: Skill, doctor, mode/prompt integration

**Files:**
- Create: `research/skills/jev-decide/SKILL.md`
- Modify: doctor script (locate via `grep -rn "doctor" research/ setup.sh bin/research` — the 12-check implementation), `research/mode/system.md`, `research/prompts/screen.md`, `docs/ARCHITECTURE.md`, `README.md`

- [ ] **Step 1: `research/skills/jev-decide/SKILL.md`** — frontmatter (name, description: when Jev applies - routing/screening/verification decisions at volume; what it never does - generate text, reason). Body: fan-out idiom (one call, all independent questions), band thresholds live in code not in the model, "calibrated across many calls ≠ correct per call", Noul has no confidence field, no-key = silent skip, key resolution order, `JEV_MAX_RECORDS` budget, cost arithmetic at $0.042/M input.
- [ ] **Step 2: Doctor** — one optional check: key present? yes → `python3 -c "import jev_client; print(jev_client.list_models(...))"` via the scripts dir (models list, non-fatal on network failure); no → "Jev first-pass OFF (optional)". Never abort `doctor` nonzero on this check. Match the existing check output format exactly.
- [ ] **Step 3: `research/mode/system.md`** — append one paragraph: with `TYPESAFE_API_KEY` set, propose a Jev first pass before agent screening ("I can run a cheap Jev first pass over N records; only clear cases get decided, the rest come to you"); without, say nothing about it.
- [ ] **Step 4: `research/prompts/screen.md`** — add: how to produce `criteria.json` from the project's scope.md (map each must-meet criterion to a key with its full text), and the escalation posture (Jev bands first, screener agent judges everything left).
- [ ] **Step 5: `docs/ARCHITECTURE.md`** — new "Jev first-pass (optional)" subsection under the screening stage: component path, band rule, provenance format, offline test strategy; one `path:line` citation per claim, verify each.
- [ ] **Step 6: `README.md`** — one short capability bullet in the existing style (no new demo assets this round; no promises of GIFs).
- [ ] **Step 7: Gates** — `bash research/tests/run.sh` green; `grep -rn "/Users/" research/ | wc -l` = 0; `grep -ric "sci-hub\|scihub\|libgen" research/ README.md` = 0; `research doctor` runs with and without a key (exit 0 both ways).
- [ ] **Step 8: Commit** — `git commit -m "docs(research): jev-decide skill, doctor check, first-pass posture in mode/prompts"`

### Task 5: Final verification + architecture doc check

- [ ] **Step 1: Full gates:** suite (`bash research/tests/run.sh`), mutation spot-check already done in Task 2, doctor both modes, offline test run with `TYPESAFE_API_KEY` unset AND set to garbage (suite must not depend on the env var at all).
- [ ] **Step 2: `git log --oneline main..feat/jev-firstpass`** — expect 3 commits (client, screen, docs); `git diff main --stat` — expect ONLY files under `research/`.
- [ ] **Step 3: Print files changed + final test counts in the exit summary.** Do NOT push; do NOT merge to main; leave the branch checked out.
