# Fork-Sync Weekly PR Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-executing-plans (single dispatch executes all tasks in order). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fork-owned GitHub Actions workflow that weekly merges `can1357/oh-my-pi:main` into the fork and opens a PR, with the merge logic in a locally testable shell script.

**Architecture:** `scripts/sync-upstream.sh` holds the verified manual sync procedure (fetch → count → merge on fetched ref → README-ours conflict policy → vendored-README refresh → sync-note sha update → research test gate → push). `fork-sync.yml` schedules it, opens the PR with `gh`. Python stdlib unittest suite builds tiny git fixture repos and runs the real script offline. Design spec: `docs/superpowers/specs/2026-09-19-fork-sync-workflow-design.md`.

**Tech Stack:** bash (git CLI), GitHub Actions (`actions/checkout@v4`, `gh` CLI), Python 3 stdlib unittest.

**Branch:** create `feat/fork-sync-workflow` off `main` in Task 1; ALL tasks commit there. Never rebase, never push, never touch `packages/`, `crates/`, root `package.json`, `bun.lock`. Do NOT modify `README.md` beyond the scripted sync-note line changes the tests require — the real README is only changed by the script at runtime, never by hand.

---

### Task 1: Test suite scaffold + up-to-date no-op path (RED → GREEN)

**Files:**
- Create: `.github/tests/test_sync_upstream.py`
- Create: `.github/scripts/sync-upstream.sh`

- [ ] **Step 1: Create branch**

```bash
cd /Users/laansdole/Projects/research-harness
git checkout -b feat/fork-sync-workflow main
```

- [ ] **Step 2: Write the test file with helpers and the first test**

Create `.github/tests/test_sync_upstream.py` with EXACTLY this content:

```python
"""Contract tests for .github/scripts/sync-upstream.sh.

Offline: every test builds tiny fixture git repos in a temp dir and runs the
REAL script against them. No network, no writes outside the temp dir.
Run: python3 -m unittest discover -s .github/tests -v
"""

import os
import subprocess
import tempfile
import textwrap
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(REPO_ROOT, ".github", "scripts", "sync-upstream.sh")

SYNC_NOTE = "**Staying in sync with upstream** (synced to upstream `main` {sha}, {date}):"

HEADER = textwrap.dedent(
    """\
    <!-- Vendored verbatim from can1357/oh-my-pi README.md @ oldsha0 (2000-01-01) for fork reference.
         Refresh each sync: git show upstream/main:README.md > body, keep this 4-line header.
         Provenance: LaansDole/research-harness fork of can1357/oh-my-pi (itself derived from badlogic/pi-mono).
         Gate: diff <(tail -n +5 docs/UPSTREAM.md) <(git show upstream/main:README.md) -> empty -->
    """
)


class Fixture:
    """Builds origin(bare) + upstream + fork repos, wires remotes, seeds env."""

    def __init__(self, tmp):
        self.tmp = tmp
        self.upstream = os.path.join(tmp, "upstream")
        self.origin = os.path.join(tmp, "origin.git")
        self.fork = os.path.join(tmp, "fork")
        self.marker = os.path.join(tmp, "research-tests-ran")
        # upstream: its own repo with its own README (the thing we merge FROM)
        self._git("init", "-q", self.upstream, "-b", "main")
        self.commit(self.upstream, "README.md", "upstream readme v1\n", "upstream base")
        self.commit(self.upstream, "docs/SHARED.md", "shared v1\n", "upstream shared file")
        # origin: bare remote standing in for github.com/LaansDole/research-harness
        self._git("init", "-q", "--bare", self.origin, "-b", "main")
        # fork: CLONED from upstream so the histories are related (like the real fork);
        # then it diverges: own README, vendored UPSTREAM.md, stub research gate.
        self._git("clone", "-q", self.upstream, self.fork)
        self.commit(self.fork, "README.md", self.fork_readme("oldsha0", "2000-01-01"), "fork owns its README")
        self.commit(self.fork, "docs/UPSTREAM.md", HEADER + "upstream readme v1\n", "vendor upstream readme")
        self.commit(self.fork, "research/tests/run.sh", STUB_RUN_SH, "stub research gate")
        os.chmod(os.path.join(self.fork, "research", "tests", "run.sh"), 0o755)
        self._git("-C", self.fork, "remote", "remove", "origin")
        self._git("-C", self.fork, "remote", "add", "origin", self.origin)
        self._git("-C", self.fork, "push", "-q", "origin", "main")
        self._git("-C", self.fork, "remote", "add", "upstream", self.upstream)
        self._git("-C", self.fork, "fetch", "-q", "upstream")

    @staticmethod
    def fork_readme(sha, date):
        return textwrap.dedent(
            """\
            # research-harness

            Fork README. The fork owns this file.

            {note}

            ```sh
            git fetch upstream main
            git merge upstream/main
            ```
            """
        ).format(note=SYNC_NOTE.format(sha=sha, date=date))

    def commit(self, repo, path, content, msg):
        full = os.path.join(repo, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as f:
            f.write(content)
        self._git("-C", repo, "add", path)
        self._git("-C", repo, "commit", "-q", "-m", msg)

    def upstream_commit(self, path, content, msg):
        self.commit(self.upstream, path, content, msg)
        self._git("-C", self.fork, "fetch", "-q", "upstream")

    def run_script(self, *extra_env):
        env = dict(os.environ)
        env.update(
            UPSTREAM_URL=self.upstream,
            SYNC_TEST_MARKER=self.marker,
            GIT_AUTHOR_NAME="test",
            GIT_AUTHOR_EMAIL="test@example.com",
            GIT_COMMITTER_NAME="test",
            GIT_COMMITTER_EMAIL="test@example.com",
        )
        for kv in extra_env:
            k, v = kv.split("=", 1)
            env[k] = v
        return subprocess.run(
            ["bash", SCRIPT],
            cwd=self.fork,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

    @staticmethod
    def _git(*args):
        env = dict(
            os.environ,
            GIT_AUTHOR_NAME="test",
            GIT_AUTHOR_EMAIL="test@example.com",
            GIT_COMMITTER_NAME="test",
            GIT_COMMITTER_EMAIL="test@example.com",
        )
        subprocess.run(["git", *args], check=True, capture_output=True, text=True, timeout=60, env=env)


STUB_RUN_SH = "#!/usr/bin/env bash\necho ran >> \"$SYNC_TEST_MARKER\"\n"


class TestUpToDateNoop(unittest.TestCase):
    def test_up_to_date_is_noop(self):
        """behind=0 -> prints UP-TO-DATE, exit 0, no sync branch, no research-test run."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("UP-TO-DATE", r.stdout)
            branches = subprocess.run(
                ["git", "-C", fx.fork, "branch", "--list", "sync/upstream"],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            self.assertEqual(branches, "")
            self.assertFalse(os.path.exists(fx.marker))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the test to verify it FAILS (script missing)**

```bash
cd /Users/laansdole/Projects/research-harness && python3 -m unittest discover -s .github/tests -v
```

Expected: `ENONENT`/`FileNotFoundError`-style failure or "No such file or directory" for `sync-upstream.sh`. The test must NOT pass.

- [ ] **Step 4: Implement the script's prep + up-to-date path**

Create `.github/scripts/sync-upstream.sh` with EXACTLY this content (later tasks extend the marked sections):

```bash
#!/usr/bin/env bash
# sync-upstream.sh — merge upstream main into this fork and prep the PR branch.
# Fork-owned (LaansDole/research-harness). Procedure per
# docs/superpowers/specs/2026-09-19-fork-sync-workflow-design.md.
#
# Env: UPSTREAM_URL (default https://github.com/can1357/oh-my-pi.git)
#      SYNC_BRANCH  (default sync/upstream)
#      BASE_REF     (default origin/main)
#      SYNC_DRY_RUN (1 = stop before push)
# Exit: 0 synced | 0 + "UP-TO-DATE" when behind=0 | 1 conflict/failed gate | 2 usage
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/can1357/oh-my-pi.git}"
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream}"
BASE_REF="${BASE_REF:-origin/main}"
DRY_RUN="${SYNC_DRY_RUN:-0}"

fail() { echo "ERROR: $*" >&2; exit 1; }

# --- prep (idempotent) -------------------------------------------------------
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch -q origin main
git fetch -q upstream main

# --- README sync-note presence (fail BEFORE any branch/merge work) -----------
grep -qF 'Staying in sync with upstream' README.md \
  || fail "sync-note line missing from README.md — aborting before merge"

BEHIND=$(git rev-list --count "${BASE_REF}..upstream/main")
if [ "$BEHIND" -eq 0 ]; then
  echo "UP-TO-DATE"
  exit 0
fi
echo "upstream ahead by $BEHIND commits"

# --- merge on the FETCHED base ref (never a possibly-stale local main) -------
git checkout -q -B "$SYNC_BRANCH" "$BASE_REF"

if ! git merge upstream/main --no-ff -m "Merge upstream can1357/oh-my-pi main ($BEHIND commits) into main"; then
  CONFLICTS=$(git diff --name-only --diff-filter=U)
  if [ "$CONFLICTS" = "README.md" ]; then
    git checkout --ours README.md
    git add README.md
    git commit -q --no-edit
  else
    echo "Unexpected conflicts — refusing to auto-resolve:" >&2
    echo "$CONFLICTS" >&2
    exit 1
  fi
fi

# --- refresh vendored upstream README (docs/UPSTREAM.md) ---------------------
UP_SHA=$(git rev-parse --short upstream/main)
UP_DATE=$(git log -1 --format=%ad --date=short upstream/main)
{
  printf '%s\n' \
    "<!-- Vendored verbatim from can1357/oh-my-pi README.md @ $UP_SHA ($UP_DATE) for fork reference." \
    "     Refresh each sync: git show upstream/main:README.md > body, keep this 4-line header." \
    "     Provenance: LaansDole/research-harness fork of can1357/oh-my-pi (itself derived from badlogic/pi-mono)." \
    "     Gate: diff <(tail -n +5 docs/UPSTREAM.md) <(git show upstream/main:README.md) -> empty -->"
  git show upstream/main:README.md
} > docs/UPSTREAM.md
if [ -n "$(diff <(tail -n +5 docs/UPSTREAM.md) <(git show upstream/main:README.md))" ]; then
  fail "docs/UPSTREAM.md body does not match upstream README"
fi

# --- update README sync-note sha/date ---------------------------------------
grep -qF 'Staying in sync with upstream' README.md \
  || fail "sync-note line missing from README.md — aborting before commit"
perl -pi -e 's/\Q**Staying in sync with upstream** (synced to upstream `main` \E[0-9a-f]+, \d{4}-\d{2}-\d{2}\Q):\E/**Staying in sync with upstream** (synced to upstream `main` '"$UP_SHA"', '"$UP_DATE"'):/' README.md
grep -qF "(synced to upstream \`main\` $UP_SHA, $UP_DATE):" README.md \
  || fail "sync-note update did not land"

# --- fork test gate ----------------------------------------------------------
bash research/tests/run.sh

# --- commit doc updates ------------------------------------------------------
git add docs/UPSTREAM.md README.md
if ! git diff --cached --quiet; then
  git commit -q -m "docs: refresh vendored upstream README to $UP_SHA"
fi

# --- ship --------------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY-RUN-OK branch=$SYNC_BRANCH ahead_of_base=$(git rev-list --count "${BASE_REF}..HEAD")"
  exit 0
fi

git push -q origin "$SYNC_BRANCH" 2>/dev/null || git push -q origin "$SYNC_BRANCH" --force
echo "SYNCED branch=$SYNC_BRANCH"
```

```bash
chmod +x .github/scripts/sync-upstream.sh
```

- [ ] **Step 5: Run the test to verify it PASSES**

```bash
cd /Users/laansdole/Projects/research-harness && python3 -m unittest discover -s .github/tests -v
```

Expected: `test_up_to_date_is_noop ... ok`, `Ran 1 test`, `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/laansdole/Projects/research-harness
git add .github/tests/test_sync_upstream.py .github/scripts/sync-upstream.sh
git commit -m "feat(sync): fork-sync script with up-to-date no-op path (tested)"
```

---

### Task 2: Merge + doc-refresh contract (RED → GREEN)

**Files:**
- Modify: `.github/tests/test_sync_upstream.py` (add test class)
- No script changes expected — this pins the behavior Task 1's implementation already provides; if a test fails, fix the SCRIPT, never the test.

- [ ] **Step 1: Add the merge-path test** (append before `if __name__ == "__main__":`)

```python
class TestMergeAndDocs(unittest.TestCase):
    def test_merge_creates_branch_updates_docs_runs_gate(self):
        """ahead>0 -> sync branch with merge commit, UPSTREAM.md body = upstream README,
        sync-note sha updated, research gate invoked."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            fx.upstream_commit("NEW.md", "new upstream file\n", "upstream adds a file")
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("SYNCED branch=sync/upstream", r.stdout)

            # merge commit is HEAD~1, doc commit is HEAD
            subjects = subprocess.run(
                ["git", "-C", fx.fork, "log", "--format=%s", "-2", "sync/upstream"],
                capture_output=True, text=True, check=True).stdout.splitlines()
            self.assertEqual(subjects[1], "Merge upstream can1357/oh-my-pi main (1 commits) into main")

            # vendored body matches upstream README, header carries new sha
            body = subprocess.run(
                ["git", "-C", fx.fork, "show", "sync/upstream:docs/UPSTREAM.md"],
                capture_output=True, text=True, check=True).stdout
            upstream_readme = subprocess.run(
                ["git", "-C", fx.fork, "show", "upstream/main:README.md"],
                capture_output=True, text=True, check=True).stdout
            self.assertEqual(body.splitlines(True)[4:], upstream_readme.splitlines(True))
            self.assertIn("upstream adds a file", body)
            self.assertNotIn("oldsha0", body.splitlines(True)[0])

            # sync-note updated on the branch
            readme = subprocess.run(
                ["git", "-C", fx.fork, "show", "sync/upstream:README.md"],
                capture_output=True, text=True, check=True).stdout
            up_sha = subprocess.run(
                ["git", "-C", fx.fork, "rev-parse", "--short", "upstream/main"],
                capture_output=True, text=True, check=True).stdout.strip()
            self.assertIn(f"synced to upstream `main` {up_sha},", readme)

            # research gate actually ran
            self.assertTrue(os.path.exists(fx.marker))
```

- [ ] **Step 2: Run the suite — both tests pass** (script already implements this path)

```bash
cd /Users/laansdole/Projects/research-harness && python3 -m unittest discover -s .github/tests -v
```

Expected: `Ran 2 tests`, `OK`. If FAIL: fix `.github/scripts/sync-upstream.sh`, never the test.

- [ ] **Step 3: Commit**

```bash
cd /Users/laansdole/Projects/research-harness
git add .github/tests/test_sync_upstream.py
git commit -m "test(sync): merge + vendored-README + sync-note contract"
```

---

### Task 3: Conflict policy — README ours, everything else fails loudly (RED → GREEN)

**Files:**
- Modify: `.github/tests/test_sync_upstream.py` (add test class)
- Possibly `.github/scripts/sync-upstream.sh` (only if a test exposes a real gap)

- [ ] **Step 1: Add the conflict tests** (append before `if __name__ == "__main__":`)

```python
class TestConflictPolicy(unittest.TestCase):
    def test_readme_conflict_resolves_ours(self):
        """The fork owns README.md: divergent README histories -> merge succeeds,
        README on the branch equals the fork's README, exit 0."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            fx.commit(fx.fork, "README.md", fx.fork_readme("oldsha0", "2000-01-01") + "\nFork-only section.\n", "fork edits readme")
            fx.upstream_commit("README.md", "upstream readme v2\n", "upstream edits readme")
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            readme = subprocess.run(
                ["git", "-C", fx.fork, "show", "sync/upstream:README.md"],
                capture_output=True, text=True, check=True).stdout
            self.assertIn("Fork-only section.", readme)
            self.assertNotIn("upstream readme v2", readme)

    def test_unexpected_conflict_fails_loudly(self):
        """Divergent non-README file -> exit 1, conflicts listed, no sync-note commit."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            fx.commit(fx.fork, "docs/SHARED.md", "fork version\n", "fork edits shared")
            fx.upstream_commit("docs/SHARED.md", "upstream version\n", "upstream edits shared")
            r = fx.run_script()
            self.assertEqual(r.returncode, 1)
            self.assertIn("docs/SHARED.md", r.stderr)
            log = subprocess.run(
                ["git", "-C", fx.fork, "branch", "--list", "sync/upstream"],
                capture_output=True, text=True, check=True).stdout.strip()
            # branch may exist mid-merge; the merge must NOT be committed
            if log:
                unmerged = subprocess.run(
                    ["git", "-C", fx.fork, "diff", "--name-only", "--diff-filter=U"],
                    capture_output=True, text=True, check=True).stdout.strip()
                self.assertEqual(unmerged, "docs/SHARED.md")
```

- [ ] **Step 2: Run the suite**

```bash
cd /Users/laansdole/Projects/research-harness && python3 -m unittest discover -s .github/tests -v
```

Expected: `Ran 4 tests`, `OK`. If a conflict test fails, fix the script's conflict block — the policy (ours=README, fail=everything else) is the contract and does not change.

- [ ] **Step 3: Mutation check (required gate)**

Temporarily change the script's conflict branch condition from `"$CONFLICTS" = "README.md"` to `"$CONFLICTS" != "README.md"`:

```bash
cd /Users/laansdole/Projects/research-harness
sed -i.bak 's/\[ "$CONFLICTS" = "README.md" \]/[ "$CONFLICTS" != "README.md" ]/' .github/scripts/sync-upstream.sh
python3 -m unittest discover -s .github/tests -v 2>&1 | tail -3
mv .github/scripts/sync-upstream.sh.bak .github/scripts/sync-upstream.sh
python3 -m unittest discover -s .github/tests -v 2>&1 | tail -3
```

Expected: first run FAILS (at least `test_readme_conflict_resolves_ours`), second run `OK`. Paste both outputs. `git diff` must be empty afterwards.

- [ ] **Step 4: Commit**

```bash
cd /Users/laansdole/Projects/research-harness
git add .github/tests/test_sync_upstream.py
git commit -m "test(sync): README-ours conflict policy and loud failure for unexpected conflicts"
```

---

### Task 4: Dry-run + missing sync-note abort (RED → GREEN)

**Files:**
- Modify: `.github/tests/test_sync_upstream.py` (add test class)

- [ ] **Step 1: Add the tests** (append before `if __name__ == "__main__":`)

```python
class TestDryRunAndSafety(unittest.TestCase):
    def test_dry_run_pushes_nothing(self):
        """SYNC_DRY_RUN=1 -> DRY-RUN-OK locally, origin gains no branch."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            fx.upstream_commit("NEW.md", "x\n", "upstream file")
            r = fx.run_script("SYNC_DRY_RUN=1")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("DRY-RUN-OK branch=sync/upstream", r.stdout)
            remote_branches = subprocess.run(
                ["git", "-C", fx.fork, "ls-remote", "--heads", "origin"],
                capture_output=True, text=True, check=True).stdout
            self.assertNotIn("sync/upstream", remote_branches)

    def test_missing_sync_note_aborts_before_merge(self):
        """README without the sync line -> exit 1, no sync branch created."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            bare_readme = "# research-harness\n\nNo sync note here.\n"
            fx.commit(fx.fork, "README.md", bare_readme, "drop sync note")
            fx.upstream_commit("NEW.md", "x\n", "upstream file")
            r = fx.run_script()
            self.assertEqual(r.returncode, 1)
            self.assertIn("sync-note", r.stderr)
            branches = subprocess.run(
                ["git", "-C", fx.fork, "branch", "--list", "sync/upstream"],
                capture_output=True, text=True, check=True).stdout.strip()
            self.assertEqual(branches, "")
```

- [ ] **Step 2: Run the suite**

```bash
cd /Users/laansdole/Projects/research-harness && python3 -m unittest discover -s .github/tests -v
```

Expected: `Ran 6 tests`, `OK`. If the missing-note test fails, move the sync-note check EARLIER in the script (it must run before `git checkout -B`).

- [ ] **Step 3: Isolation gate — suite must pass from a foreign cwd**

Create `.github/tests/run_tests.sh` first:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
exec python3 -m unittest discover -s .github/tests -v "$@"
```

```bash
chmod +x .github/tests/run_tests.sh
```

Then run it from somewhere that is NOT the repo (proves the suite builds its own fixture paths and depends on no ambient cwd or env):

```bash
cd /tmp && /Users/laansdole/Projects/research-harness/.github/tests/run_tests.sh 2>&1 | tail -3
```

Expected: `OK`. (The suite creates its own temp dirs and reads no user data.)

- [ ] **Step 4: Commit**

```bash
cd /Users/laansdole/Projects/research-harness
git add .github/tests/test_sync_upstream.py .github/tests/run_tests.sh
git commit -m "test(sync): dry-run no-push and missing-sync-note abort"
```

---

### Task 5: GitHub Actions workflow (no tests possible locally — validate structure)

**Files:**
- Create: `.github/workflows/fork-sync.yml`

- [ ] **Step 1: Create the workflow** with EXACTLY this content:

```yaml
name: Fork sync

# Weekly merge of can1357/oh-my-pi:main into this fork + PR.
# Scheduled workflows only run from the default branch; keep this on main.
on:
  schedule:
    - cron: '17 3 * * 1' # Mon 03:17 UTC = Mon 10:17 +07
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: fork-sync
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Merge upstream
        id: merge
        run: |
          OUT=$(bash .github/scripts/sync-upstream.sh) || { echo "$OUT"; exit 1; }
          echo "$OUT"
          if echo "$OUT" | grep -qx 'UP-TO-DATE'; then
            echo "status=up-to-date" >> "$GITHUB_OUTPUT"
          else
            echo "status=synced" >> "$GITHUB_OUTPUT"
          fi

      - name: Open sync PR
        if: steps.merge.outputs.status == 'synced'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          DATE=$(date +%F)
          OPEN=$(gh pr list --head sync/upstream --state open --json number --jq 'length')
          if [ "$OPEN" != "0" ]; then
            echo "Sync PR already open — leaving it alone"
            exit 0
          fi
          gh pr create \
            --base main \
            --head sync/upstream \
            --title "Sync upstream can1357/oh-my-pi ($DATE)" \
            --body "$(cat <<'EOF'
          Automated weekly upstream sync.

          - Merges `can1357/oh-my-pi:main` into `sync/upstream` (built on `origin/main`).
          - `README.md` conflict resolved OURS (this fork owns its README); upstream's README stays vendored in `docs/UPSTREAM.md`.
          - `docs/UPSTREAM.md` + the README sync-note sha are refreshed by the script.
          - `research/tests/run.sh` passed on the merge result.
          - Any conflict other than `README.md` fails the run loudly instead of guessing.

          Review, then merge. Never click GitHub's "Discard N commits" — that deletes the research layer.
          EOF
          )"
```

- [ ] **Step 2: Validate YAML parses and required keys exist (dependency-free)**

```bash
cd /Users/laansdole/Projects/research-harness && python3 - <<'EOF'
path = ".github/workflows/fork-sync.yml"
text = open(path).read()
required = [
    "schedule:",
    "cron: '17 3 * * 1'",
    "workflow_dispatch:",
    "permissions:",
    "contents: write",
    "pull-requests: write",
    "actions/checkout@v4",
    "fetch-depth: 0",
    "steps.merge.outputs.status == 'synced'",
    "gh pr create",
    "--base main",
    "--head sync/upstream",
]
missing = [n for n in required if n not in text]
assert not missing, f"missing from {path}: {missing}"
try:
    import yaml
    wf = yaml.safe_load(text)
    job = wf["jobs"]["sync"]
    assert job["permissions"] == {"contents": "write", "pull-requests": "write"}
    sched = wf.get(True, wf.get("on", {}))
    assert sched["schedule"][0]["cron"] == "17 3 * * 1"
    steps = job["steps"]
    assert any(s.get("uses") == "actions/checkout@v4" and s.get("with", {}).get("fetch-depth") == 0 for s in steps)
    assert any("steps.merge.outputs.status == 'synced'" in (s.get("if") or "") for s in steps)
    assert any("gh pr create" in (s.get("run") or "") for s in steps)
    print("workflow yaml OK (PyYAML parsed)")
except ImportError:
    print("workflow yaml OK (structure greps; PyYAML unavailable)")
EOF
```

Expected: `workflow yaml OK` (either suffix). Do NOT pip-install anything to satisfy this check.

- [ ] **Step 3: Commit**

```bash
cd /Users/laansdole/Projects/research-harness
git add .github/workflows/fork-sync.yml
git commit -m "ci(sync): weekly upstream-sync workflow opening a PR on the fork"
```

---

### Task 6: Full gates on the finished branch

- [ ] **Step 1: New suite green**

```bash
cd /Users/laansdole/Projects/research-harness && bash .github/tests/run_tests.sh 2>&1 | tail -3
```

Expected: `Ran 6 tests`, `OK`.

- [ ] **Step 2: Existing research suite still green**

```bash
cd /Users/laansdole/Projects/research-harness && bash research/tests/run.sh 2>&1 | tail -3
```

Expected: `Ran 91 tests`, `OK (skipped=1)`.

- [ ] **Step 3: Real-remote dry run against the ACTUAL upstream**

```bash
cd /Users/laansdole/Projects/research-harness && SYNC_DRY_RUN=1 bash .github/scripts/sync-upstream.sh
```

Expected today: `UP-TO-DATE` (main was just synced to 78b753124d). If it instead prints `upstream ahead by N`, STOP and report — do not let the dry run leave a local branch behind: run `git checkout main && git branch -D sync/upstream` to clean up before reporting.

- [ ] **Step 4: Working tree clean, branch shape sane**

```bash
cd /Users/laansdole/Projects/research-harness && git status --porcelain && git log --oneline main..HEAD
```

Expected: empty porcelain (except pre-existing `?? docs/superpowers/`), 5 commits on the branch touching ONLY `.github/scripts/sync-upstream.sh`, `.github/tests/*`, `.github/workflows/fork-sync.yml`.

- [ ] **Step 5: Final report**

Print: files changed (git diff --name-only main..HEAD), the 6-test suite output tail, the research-suite output tail, the real-remote dry-run output, and any deviations from this plan.
