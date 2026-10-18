# Fork-Sync Conflict Capture + AI Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every weekly upstream sync opens a PR on the fork that captures all upstream changes and every conflict verbatim, and optionally lets a Command Code model resolve content conflicts as a separate, guarded commit.

**Architecture:** `sync-upstream.sh` commits conflicts *with markers*, one typed git trailer per file (`Sync-Conflict: <code> <path>`). Git is therefore the single source of truth for every later step. `ai-resolve.sh` runs headless omp in a credential-free step, then reverts anything outside the rules. `sync-pr-body.sh` renders the PR from trailers plus report files kept under `.git/sync-report/`. `check-sync-markers.sh` is the one marker regex, shared by the resolver and the `sync-guard` PR check.

**Tech Stack:** bash (git CLI) · GitHub Actions (`actions/checkout@v7`, `oven-sh/setup-bun@v2`, `actions/upload-artifact@v4`, `gh`) · headless omp (`@oh-my-pi/pi-coding-agent`) · Python 3 stdlib `unittest`.

**Spec:** `docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md`

## Global Constraints

- Scripts must run on **macOS bash 3.2** (dev) and **ubuntu-24.04 bash 5.2** (CI): no `mapfile`, no `${arr[@]}` on possibly-empty arrays under `set -u` (use `${arr[@]+"${arr[@]}"}`), no GNU-only `sed` (`sed -E` only), no `timeout`.
- git ≥ 2.32 (`git commit --trailer`); CI ubuntu-24.04 ships 2.43.
- Tests: Python 3 stdlib `unittest`, offline, temp dirs only, run with `bash .github/tests/run_tests.sh`. Every test pins the env it depends on (e.g. `COMMAND_CODE_API_KEY=`), because a developer shell may export real values.
- Never touch `packages/`, `crates/`, root `package.json`, `bun.lock`.
- Default model `commandcode/z-ai/glm-5.3-flash`; override only via repo variable `SYNC_AI_MODEL`.
- The AI prompt is a static file `.github/prompts/resolve-conflicts.md`, with no templating and no prompt strings in shell.
- The agent step never has a GitHub write credential: checkout uses `persist-credentials: false`, and push auth is step-scoped `GIT_CONFIG_*` env on the merge step and the PR step only.
- Repo rule: **NEVER commit unless the user asked.** Each task's commit step runs only once the user has authorized commits for this plan.
- Branch: `feat/fork-sync-conflict-capture` off `origin/main`.
- `docs/superpowers/` stays untracked (0 files on `main`), so never `git add` specs or plans. Tracked docs change only in `docs/ARCHITECTURE.md`.

## File Structure

| File | Responsibility |
| --- | --- |
| `.github/scripts/sync-upstream.sh` (modify) | merge + conflict capture (typed trailers, report dir) + change capture (shortlog/diffstat/overlap) + docs refresh + gate (only when clean) + lease push |
| `.github/scripts/check-sync-markers.sh` (new) | the one marker regex; scans trailer-listed `UU`/`AA` paths or given paths |
| `.github/scripts/ai-resolve.sh` (new) | preconditions → headless omp → guard (scope, partial, untracked, key leak, agent commits) → local commit with `Sync-AI-Resolved` trailers |
| `.github/prompts/resolve-conflicts.md` (new) | static resolver instructions |
| `.github/scripts/sync-pr-body.sh` (new) | PR body from trailers + report dir; prints `conflicts=K ai=R` |
| `.github/workflows/fork-sync.yml` (modify) | preflight skip, merge, AI gate, PR create/update, labels, artifact |
| `.github/workflows/sync-guard.yml` (new) | PR check: red while markers remain |
| `.github/tests/test_sync_upstream.py` (modify) | shared `Fixture`; sync-script contracts |
| `.github/tests/test_sync_ai_and_guard.py` (new) | resolver/guard/body contracts with a stub `omp` |
| `docs/ARCHITECTURE.md` §11 (modify) | describe the new flow; fix cited line numbers |

---

### Task 1: Conflict-capturing `sync-upstream.sh`

**Files:**
- Modify: `.github/tests/test_sync_upstream.py` (full replacement below)
- Modify: `.github/scripts/sync-upstream.sh` (full replacement below)

**Interfaces:**
- Produces:
  - merge-commit trailers `Sync-Conflict: <UU|AA|DU|UD|AU|UA|DD> <path>` (one per non-README conflict) and `Sync-Ours: <code> README.md`;
  - report dir `${SYNC_REPORT_DIR:-<abs-git-dir>/sync-report}` containing `conflicts.txt` (`<code> <path>` lines), `conflicts.diff`, `shortlog.txt`, `diffstat.txt` and `overlap.txt`;
  - last stdout line `SYNCED branch=<b> conflicts=<K>`, `DRY-RUN-OK branch=<b> conflicts=<K> ahead_of_base=<n>`, or `UP-TO-DATE`.
- Produces for tests: `Fixture(tmp, base_files=None)`, `Fixture.run_script(*env, script=SCRIPT)`, `Fixture.git_out(*args) -> str`, `Fixture.report(name) -> str`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/laansdole/Projects/research-harness
git fetch -q origin main
git switch -c feat/fork-sync-conflict-capture origin/main
```

The untracked spec file comes along with the switch.

- [ ] **Step 2: Replace the test file**

Write `.github/tests/test_sync_upstream.py` with exactly this content. Compared with `main`:
- `Fixture` gains `base_files`, `script=`, `git_out` and `report`;
- the fixture commits the gate's exec bit, because a dirty mode change looks like an unclean worktree;
- `test_unexpected_conflict_fails_loudly` is **replaced**, since that contract changed;
- there are 3 new tests.

````python
"""Contract tests for .github/scripts/sync-upstream.sh (and the shared Fixture).

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

    def __init__(self, tmp, base_files=None):
        self.tmp = tmp
        self.origin_ready = False  # fork commits only mirror to origin once it is wired
        self.upstream = os.path.join(tmp, "upstream")
        self.origin = os.path.join(tmp, "origin.git")
        self.fork = os.path.join(tmp, "fork")
        self.marker = os.path.join(tmp, "research-tests-ran")
        # upstream: its own repo with its own README (the thing we merge FROM)
        self._git("init", "-q", self.upstream, "-b", "main")
        self.commit(self.upstream, "README.md", "upstream readme v1\n", "upstream base")
        self.commit(self.upstream, "docs/SHARED.md", "shared v1\n", "upstream shared file")
        for path, content in (base_files or {}).items():  # common-ancestor content
            self.commit(self.upstream, path, content, f"upstream base {path}")
        # origin: bare remote standing in for github.com/LaansDole/research-harness
        self._git("init", "-q", "--bare", self.origin, "-b", "main")
        # fork: CLONED from upstream so the histories are related (like the real fork);
        # then it diverges: own README, vendored UPSTREAM.md, stub research gate.
        self._git("clone", "-q", self.upstream, self.fork)
        self.commit(self.fork, "README.md", self.fork_readme("oldsha0", "2000-01-01"), "fork owns its README")
        self.commit(self.fork, "docs/UPSTREAM.md", HEADER + "upstream readme v1\n", "vendor upstream readme")
        self.commit(self.fork, "research/tests/run.sh", STUB_RUN_SH, "stub research gate")
        os.chmod(os.path.join(self.fork, "research", "tests", "run.sh"), 0o755)
        # commit the exec bit too: a dirty mode change would look like an unclean worktree
        self._git("-C", self.fork, "commit", "-qam", "research gate is executable")
        self._git("-C", self.fork, "remote", "remove", "origin")
        self._git("-C", self.fork, "remote", "add", "origin", self.origin)
        self._git("-C", self.fork, "push", "-q", "origin", "main")
        self.origin_ready = True
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
        # the real fork's main lives on origin; the script builds on the fetched origin/main
        if repo == self.fork and self.origin_ready:
            self._git("-C", repo, "push", "-q", "origin", "main")

    def upstream_commit(self, path, content, msg):
        self.commit(self.upstream, path, content, msg)
        self._git("-C", self.fork, "fetch", "-q", "upstream")

    def run_script(self, *extra_env, script=SCRIPT):
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
            ["bash", script],
            cwd=self.fork,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

    def git_out(self, *args):
        return subprocess.run(
            ["git", "-C", self.fork, *args], capture_output=True, text=True, check=True
        ).stdout

    def report(self, name):
        with open(os.path.join(self.fork, ".git", "sync-report", name)) as f:
            return f.read()

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

    def test_unexpected_conflict_committed_with_markers(self):
        """Divergent non-README file -> merge committed WITH markers, typed trailer,
        report lists it, research gate skipped (markers make it meaningless), exit 0."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            fx.commit(fx.fork, "docs/SHARED.md", "fork version\n", "fork edits shared")
            fx.upstream_commit("docs/SHARED.md", "upstream version\n", "upstream edits shared")
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.rstrip().endswith("conflicts=1"), r.stdout)
            merge = fx.git_out("log", "--merges", "-1", "--format=%H", "sync/upstream").strip()
            self.assertEqual(len(fx.git_out("rev-list", "--parents", "-1", merge).split()), 3)
            self.assertEqual(
                fx.git_out("log", "-1", "--format=%(trailers:key=Sync-Conflict,valueonly)", merge).strip(),
                "UU docs/SHARED.md")
            self.assertIn("<<<<<<< ", fx.git_out("show", "sync/upstream:docs/SHARED.md"))
            self.assertEqual(fx.report("conflicts.txt"), "UU docs/SHARED.md\n")
            self.assertIn("<<<<<<< ", fx.report("conflicts.diff"))
            self.assertFalse(os.path.exists(fx.marker))
            # the captured branch really reached origin
            self.assertIn("refs/heads/sync/upstream", fx.git_out("ls-remote", "--heads", "origin"))

    def test_delete_modify_conflict_captured(self):
        """Upstream deletes a file the fork modified -> tree conflict UD captured,
        fork's version kept, merge committed."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp, base_files={"docs/GONE.md": "base\n"})
            fx.commit(fx.fork, "docs/GONE.md", "fork keeps and edits\n", "fork edits gone")
            fx._git("-C", fx.upstream, "rm", "-q", "docs/GONE.md")
            fx._git("-C", fx.upstream, "commit", "-q", "-m", "upstream deletes gone")
            fx._git("-C", fx.fork, "fetch", "-q", "upstream")
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            merge = fx.git_out("log", "--merges", "-1", "--format=%H", "sync/upstream").strip()
            self.assertEqual(
                fx.git_out("log", "-1", "--format=%(trailers:key=Sync-Conflict,valueonly)", merge).strip(),
                "UD docs/GONE.md")
            self.assertEqual(fx.git_out("show", "sync/upstream:docs/GONE.md"), "fork keeps and edits\n")

    def test_readme_only_conflict_is_not_counted(self):
        """README conflict alone -> conflicts=0, gate runs, recorded as Sync-Ours not Sync-Conflict."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp)
            fx.commit(fx.fork, "README.md", fx.fork_readme("oldsha0", "2000-01-01") + "\nFork-only.\n", "fork readme")
            fx.upstream_commit("README.md", "upstream readme v2\n", "upstream readme")
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.rstrip().endswith("conflicts=0"), r.stdout)
            merge = fx.git_out("log", "--merges", "-1", "--format=%H", "sync/upstream").strip()
            trailers = fx.git_out("log", "-1", "--format=%(trailers)", merge)
            self.assertIn("Sync-Ours: UU README.md", trailers)
            self.assertNotIn("Sync-Conflict", trailers)
            self.assertTrue(os.path.exists(fx.marker))


class TestChangeCapture(unittest.TestCase):
    def test_overlap_lists_auto_merged_shared_files(self):
        """Both sides edit different hunks of one file -> clean merge, path flagged in overlap.txt."""
        base = "l1\nl2\nl3\nl4\nl5\nl6\n"
        with tempfile.TemporaryDirectory() as tmp:
            fx = Fixture(tmp, base_files={"src/both.txt": base})
            fx.commit(fx.fork, "src/both.txt", base.replace("l1", "fork l1"), "fork edits top")
            fx.upstream_commit("src/both.txt", base.replace("l6", "upstream l6"), "upstream edits bottom")
            fx.upstream_commit("src/only-upstream.txt", "x\n", "upstream-only file")
            r = fx.run_script()
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.rstrip().endswith("conflicts=0"), r.stdout)
            self.assertEqual(fx.report("overlap.txt"), "src/both.txt\n")
            self.assertIn("upstream-only file", fx.report("shortlog.txt"))


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


if __name__ == "__main__":
    unittest.main()
````

- [ ] **Step 3: Run the tests and confirm the 4 new contracts fail**

Run: `bash .github/tests/run_tests.sh 2>&1 | grep -E '^(FAIL|ERROR):|^Ran|^FAILED|^OK'`

Expected, against the current script:
```
FAIL: test_overlap_lists_auto_merged_shared_files (...)
FAIL: test_delete_modify_conflict_captured (...)
FAIL: test_readme_only_conflict_is_not_counted (...)
FAIL: test_unexpected_conflict_committed_with_markers (...)
Ran 9 tests in ...
FAILED (failures=4)
```

- [ ] **Step 4: Replace the script**

Write `.github/scripts/sync-upstream.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# sync-upstream.sh — merge upstream main into this fork and prep the PR branch.
# Fork-owned (LaansDole/research-harness). Procedure per
# docs/superpowers/specs/2026-09-19-fork-sync-workflow-design.md, conflict capture per
# docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md.
#
# Env: UPSTREAM_URL    (default https://github.com/can1357/oh-my-pi.git)
#      SYNC_BRANCH     (default sync/upstream)
#      BASE_REF        (default origin/main)
#      SYNC_DRY_RUN    (1 = stop before push)
#      SYNC_REPORT_DIR (default <git-dir>/sync-report; never inside the worktree)
# Exit: 0 synced (conflicts committed with markers) | 0 + "UP-TO-DATE" when behind=0
#       1 failed gate/push | 2 usage
set -euo pipefail
export GIT_LITERAL_PATHSPECS=1 # conflict paths are data, never globs

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/can1357/oh-my-pi.git}"
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream}"
BASE_REF="${BASE_REF:-origin/main}"
DRY_RUN="${SYNC_DRY_RUN:-0}"
REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"

fail() { echo "ERROR: $*" >&2; exit 1; }

# git-status XY code for an unmerged path, from which index stages exist
# (1=base 2=ours/fork 3=theirs/upstream).
conflict_code() {
  case "$(git ls-files -u -- "$1" | awk '{print $3}' | sort -u | tr -d '\n')" in
    123) echo UU ;; 23) echo AA ;; 12) echo UD ;; 13) echo DU ;;
    2) echo AU ;; 3) echo UA ;; 1) echo DD ;;
    *) fail "cannot classify conflict for $1" ;;
  esac
}

# --- prep (idempotent) -------------------------------------------------------
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch -q origin main
git fetch -q upstream main
rm -rf "$REPORT_DIR"
mkdir -p "$REPORT_DIR"

# --- README sync-note presence (fail BEFORE any branch/merge work) -----------
grep -qF 'Staying in sync with upstream' README.md \
  || fail "sync-note line missing from README.md — aborting before merge"

BEHIND=$(git rev-list --count "${BASE_REF}..upstream/main")
if [ "$BEHIND" -eq 0 ]; then
  echo "UP-TO-DATE"
  exit 0
fi
echo "upstream ahead by $BEHIND commits"

# --- change capture (independent of how the merge goes) ----------------------
MB=$(git merge-base "$BASE_REF" upstream/main)
git shortlog --no-merges "$MB..upstream/main" </dev/null > "$REPORT_DIR/shortlog.txt"
git diff --stat "$MB" upstream/main > "$REPORT_DIR/diffstat.txt"

# --- merge on the FETCHED base ref (never a possibly-stale local main) -------
git checkout -q -B "$SYNC_BRANCH" "$BASE_REF"

K=0
: > "$REPORT_DIR/conflicts.txt"
if ! git merge upstream/main --no-ff -m "Merge upstream can1357/oh-my-pi main ($BEHIND commits) into main"; then
  UNMERGED=()
  while IFS= read -r -d '' p; do UNMERGED+=("$p"); done < <(git diff --name-only --diff-filter=U -z)
  [ "${#UNMERGED[@]}" -gt 0 ] || fail "merge failed without conflicts (see git output above)"
  git diff > "$REPORT_DIR/conflicts.diff" || true
  TRAILERS=()
  for p in "${UNMERGED[@]}"; do
    code=$(conflict_code "$p")
    if [ "$p" = "README.md" ]; then
      # The fork owns its README; upstream's lives on in docs/UPSTREAM.md.
      git checkout --ours README.md
      git add README.md
      TRAILERS+=(--trailer "Sync-Ours: $code README.md")
      continue
    fi
    if [ -e "$p" ]; then git add -- "$p"; else git rm -q --cached -- "$p"; fi
    printf '%s %s\n' "$code" "$p" >> "$REPORT_DIR/conflicts.txt"
    TRAILERS+=(--trailer "Sync-Conflict: $code $p")
    K=$((K + 1))
  done
  if [ "$K" -eq 0 ]; then
    SUBJECT="Merge upstream can1357/oh-my-pi main ($BEHIND commits) into main"
  else
    SUBJECT="Merge upstream can1357/oh-my-pi main ($BEHIND commits, $K unresolved conflicts) into main"
  fi
  git commit -q -m "$SUBJECT" "${TRAILERS[@]}"
fi

# auto-merged files both sides touched: silent semantic-conflict candidates
comm -12 \
  <(git -c core.quotePath=false diff --name-only "$MB" "$BASE_REF" | sort) \
  <(git -c core.quotePath=false diff --name-only "$MB" upstream/main | sort) \
  | grep -vxF -f <(cut -d' ' -f2- "$REPORT_DIR/conflicts.txt"; echo README.md) \
  > "$REPORT_DIR/overlap.txt" || true

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
# sha token = whatever sits between the fixed prefix and the comma (short sha, long sha, placeholder)
perl -pi -e 's/\Q**Staying in sync with upstream** (synced to upstream `main` \E[^,]+, \d{4}-\d{2}-\d{2}\Q):\E/**Staying in sync with upstream** (synced to upstream `main` '"$UP_SHA"', '"$UP_DATE"'):/' README.md
grep -qF "(synced to upstream \`main\` $UP_SHA, $UP_DATE):" README.md \
  || fail "sync-note update did not land"

# --- fork test gate (markers in the tree would make it meaningless) ----------
if [ "$K" -eq 0 ]; then
  bash research/tests/run.sh
fi

# --- commit doc updates ------------------------------------------------------
git add docs/UPSTREAM.md README.md
if ! git diff --cached --quiet; then
  git commit -q -m "docs: refresh vendored upstream README to $UP_SHA"
fi

# --- ship --------------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY-RUN-OK branch=$SYNC_BRANCH conflicts=$K ahead_of_base=$(git rev-list --count "${BASE_REF}..HEAD")"
  exit 0
fi

# fresh tracking ref so the lease compares against what origin really has
git fetch -q origin "$SYNC_BRANCH" 2>/dev/null || true
git push -q --force-with-lease origin "$SYNC_BRANCH" || fail "push of $SYNC_BRANCH failed"
echo "SYNCED branch=$SYNC_BRANCH conflicts=$K"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash .github/tests/run_tests.sh 2>&1 | tail -n 3`
Expected: `Ran 9 tests` … `OK`

- [ ] **Step 6: Lint**

Run: `shellcheck -S warning .github/scripts/sync-upstream.sh`
Expected: no output, exit 0.

- [ ] **Step 7: Commit** (only once the user has authorized commits)

```bash
git add .github/tests/test_sync_upstream.py .github/scripts/sync-upstream.sh
git commit -m "feat(sync): capture conflicts with markers and typed trailers instead of failing"
```

---

### Task 2: Marker guard `check-sync-markers.sh` (+ shared AI/guard/body test module)

**Files:**
- Create: `.github/tests/test_sync_ai_and_guard.py` (all three classes; Tasks 3–4 turn theirs green)
- Create: `.github/scripts/check-sync-markers.sh`

**Interfaces:**
- Consumes: `Fixture` and `REPO_ROOT` from `test_sync_upstream` (Task 1); `Sync-Conflict` trailers (Task 1).
- Produces: `bash check-sync-markers.sh [path...]`. With no args it scans the `UU`/`AA` trailer paths of `BASE_REF..HEAD`. Output is `path:line:text` per marker. Exit `0` = clean, `1` = markers found. Marker regex: `^(<<<<<<<|>>>>>>>)( |$)`.

- [ ] **Step 1: Create the shared test module**

Write `.github/tests/test_sync_ai_and_guard.py` with exactly this content:

```python
"""Contract tests for ai-resolve.sh, check-sync-markers.sh and sync-pr-body.sh.

Offline: fixture repos from test_sync_upstream.Fixture; `omp` is a stub on PATH
whose behavior is picked by STUB_MODE, so every guard branch runs for real.
Run: python3 -m unittest discover -s .github/tests -v
"""

import os
import stat
import subprocess
import tempfile
import textwrap
import unittest

from test_sync_upstream import REPO_ROOT, Fixture

SCRIPTS = os.path.join(REPO_ROOT, ".github", "scripts")
AI_RESOLVE = os.path.join(SCRIPTS, "ai-resolve.sh")
CHECK_MARKERS = os.path.join(SCRIPTS, "check-sync-markers.sh")
PR_BODY = os.path.join(SCRIPTS, "sync-pr-body.sh")
KEY = "user_test_key_123"

# Stub agent. cwd = fork worktree. STUB_FILES = comma list of files to "resolve".
STUB_OMP = textwrap.dedent(
    """\
    #!/usr/bin/env python3
    import os, subprocess, sys
    open(os.environ["STUB_LOG"], "a").write("called\\n")
    mode = os.environ["STUB_MODE"]
    files = [f for f in os.environ.get("STUB_FILES", "").split(",") if f]
    def put(path, text):
        with open(path, "w") as f:
            f.write(text)
    for p in files:
        if mode == "partial":
            put(p, "agent note\\n" + open(p).read())  # markers survive
        elif mode == "leak":
            put(p, "resolved " + os.environ["COMMAND_CODE_API_KEY"] + "\\n")
        else:
            put(p, "resolved " + p + "\\n")
    if mode == "stray":
        put("README.md", open("README.md").read() + "agent was here\\n")
        put("scratch.txt", "tmp\\n")
    if mode == "commit":
        subprocess.run(["git", "commit", "-qam", "agent commit"], check=True)
    sys.exit(3 if mode == "fail" else 0)
    """
)


class AiFixture(Fixture):
    """Fixture + stub omp on PATH + helpers to run the AI/guard/body scripts."""

    def __init__(self, tmp, base_files=None):
        super().__init__(tmp, base_files)
        self.bin = os.path.join(tmp, "bin")
        os.makedirs(self.bin)
        stub = os.path.join(self.bin, "omp")
        with open(stub, "w") as f:
            f.write(STUB_OMP)
        os.chmod(stub, os.stat(stub).st_mode | stat.S_IEXEC)
        self.stub_log = os.path.join(tmp, "omp-calls")

    def conflict(self, path, fork_text, upstream_text):
        self.commit(self.fork, path, fork_text, f"fork edits {path}")
        self.upstream_commit(path, upstream_text, f"upstream edits {path}")

    def run_ai(self, mode, files, *extra_env, key=KEY):
        return self.run_script(
            f"PATH={self.bin}:{os.environ['PATH']}",
            f"STUB_MODE={mode}",
            f"STUB_FILES={','.join(files)}",
            f"STUB_LOG={self.stub_log}",
            "SYNC_AI_MODEL=commandcode/stub-model",
            # always pinned: the developer's shell may export a real key
            f"COMMAND_CODE_API_KEY={key or ''}",
            *extra_env,
            script=AI_RESOLVE,
        )

    def head(self):
        return self.git_out("rev-parse", "HEAD").strip()


def synced_with_conflict(tmp):
    fx = AiFixture(tmp)
    fx.conflict("docs/SHARED.md", "fork version\n", "upstream version\n")
    r = fx.run_script()
    assert r.returncode == 0, r.stderr
    return fx


class TestAiResolve(unittest.TestCase):
    def test_clean_resolution_committed_with_trailer(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            before = fx.head()
            r = fx.run_ai("resolve", ["docs/SHARED.md"])
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.rstrip().endswith("AI-RESOLVED 1/1"), r.stdout)
            self.assertEqual(fx.git_out("rev-parse", "HEAD~1").strip(), before)
            self.assertEqual(
                fx.git_out("log", "-1", "--format=%(trailers:key=Sync-AI-Resolved,valueonly)").strip(),
                "docs/SHARED.md")
            self.assertEqual(fx.git_out("show", "HEAD:docs/SHARED.md"), "resolved docs/SHARED.md\n")
            # every content conflict resolved and no tree conflicts -> research gate ran
            self.assertEqual(fx.report("ai-gate.txt"), "pass\n")

    def test_out_of_scope_edits_reverted(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            r = fx.run_ai("stray", ["docs/SHARED.md"])
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("OUT-OF-SCOPE README.md reverted", r.stdout)
            self.assertEqual(fx.git_out("diff", "--name-only", "HEAD~1", "HEAD"), "docs/SHARED.md\n")
            self.assertFalse(os.path.exists(os.path.join(fx.fork, "scratch.txt")))
            self.assertEqual(fx.git_out("status", "--porcelain"), "")

    def test_partial_resolution_reverted(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            before = fx.head()
            r = fx.run_ai("partial", ["docs/SHARED.md"])
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.rstrip().endswith("AI-RESOLVED 0/1"), r.stdout)
            self.assertEqual(fx.head(), before)
            self.assertEqual(fx.git_out("status", "--porcelain"), "")

    def test_omp_failure_restores_worktree(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            before = fx.head()
            r = fx.run_ai("fail", ["docs/SHARED.md"])
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("AI-FAILED", r.stdout)
            self.assertEqual(fx.head(), before)
            self.assertEqual(fx.git_out("status", "--porcelain"), "")

    def test_missing_key_skips_without_calling_omp(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            r = fx.run_ai("resolve", ["docs/SHARED.md"], key=None)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("AI-SKIPPED", r.stdout)
            self.assertFalse(os.path.exists(fx.stub_log))

    def test_leaked_key_never_committed(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            before = fx.head()
            r = fx.run_ai("leak", ["docs/SHARED.md"])
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("AI-FAILED", r.stdout)
            self.assertEqual(fx.head(), before)
            self.assertNotIn(KEY, open(os.path.join(fx.fork, "docs", "SHARED.md")).read())

    def test_agent_commit_is_folded_into_guarded_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            before = fx.head()
            r = fx.run_ai("commit", ["docs/SHARED.md"])
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(fx.git_out("rev-parse", "HEAD~1").strip(), before)
            self.assertIn("Sync-AI-Resolved: docs/SHARED.md", fx.git_out("log", "-1", "--format=%B"))


class TestMarkerGuard(unittest.TestCase):
    def run_check(self, fx):
        return fx.run_script("BASE_REF=origin/main", script=CHECK_MARKERS)

    def test_markers_in_conflict_path_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = synced_with_conflict(tmp)
            r = self.run_check(fx)
            self.assertEqual(r.returncode, 1)
            self.assertIn("docs/SHARED.md:", r.stdout)

    def test_markers_outside_conflict_paths_ignored(self):
        """Upstream's legit marker fixtures must not trip the guard."""
        with tempfile.TemporaryDirectory() as tmp:
            fx = AiFixture(tmp)
            fx.upstream_commit("fixtures/conflict.txt", "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n", "fixture")
            self.assertEqual(fx.run_script().returncode, 0)
            r = self.run_check(fx)
            self.assertEqual(r.returncode, 0, r.stdout)


class TestPrBody(unittest.TestCase):
    def test_every_conflict_row_has_its_resolution(self):
        with tempfile.TemporaryDirectory() as tmp:
            fx = AiFixture(tmp, base_files={"docs/GONE.md": "base\n"})
            fx.conflict("docs/SHARED.md", "fork version\n", "upstream version\n")
            fx.conflict("docs/OTHER.md", "fork adds other\n", "upstream adds other\n")  # AA
            fx.commit(fx.fork, "docs/GONE.md", "fork edits gone\n", "fork edits gone")
            fx._git("-C", fx.upstream, "rm", "-q", "docs/GONE.md")
            fx._git("-C", fx.upstream, "commit", "-q", "-m", "upstream deletes gone")
            fx._git("-C", fx.fork, "fetch", "-q", "upstream")
            self.assertEqual(fx.run_script().returncode, 0)
            self.assertIn("AI-RESOLVED 1/2", fx.run_ai("resolve", ["docs/SHARED.md"]).stdout)

            r = fx.run_script("GITHUB_REPOSITORY=LaansDole/research-harness", script=PR_BODY)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), "conflicts=3 ai=1")
            body = fx.report("pr-body.md")
            ai_sha = fx.git_out("rev-parse", "--short", "HEAD").strip()
            self.assertIn(f"| `docs/SHARED.md` | UU | AI ({ai_sha}) |", body)
            self.assertIn("| `docs/OTHER.md` | AA | **UNRESOLVED** |", body)
            self.assertIn("| `docs/GONE.md` | UD | **TREE: kept present — review** |", body)

    def test_huge_conflict_diff_stays_under_github_limit(self):
        big_fork = "".join(f"fork line {i}\n" for i in range(20000))
        big_up = "".join(f"upstream line {i}\n" for i in range(20000))
        with tempfile.TemporaryDirectory() as tmp:
            fx = AiFixture(tmp)
            fx.conflict("docs/SHARED.md", big_fork, big_up)
            self.assertEqual(fx.run_script().returncode, 0)
            r = fx.run_script(script=PR_BODY)
            self.assertEqual(r.returncode, 0, r.stderr)
            body = fx.report("pr-body.md")
            self.assertLess(len(body), 65536)
            self.assertIn("| `docs/SHARED.md` | UU | **UNRESOLVED** |", body)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the marker-guard tests and confirm they fail**

Run: `python3 -m unittest discover -s .github/tests -p 'test_sync_ai_and_guard.py' -k TestMarkerGuard -v 2>&1 | tail -n 4`
Expected: `FAILED (failures=2)`. The script is missing, so `bash` exits 127.

- [ ] **Step 3: Create the guard script**

Write `.github/scripts/check-sync-markers.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# check-sync-markers.sh — fail while a sync content-conflict file still carries markers.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md §2
#
# No args: scan the UU/AA paths named in `Sync-Conflict:` trailers of BASE_REF..HEAD.
# Args:    scan exactly the given paths (ai-resolve.sh uses this per file).
# Only conflict paths are scanned: upstream ships legitimate marker fixtures
# (omp's `:conflicts` read selector), so a whole-tree scan would false-positive.
# Env: BASE_REF (default origin/main)
# Output: path:line:text per marker line. Exit: 0 clean | 1 markers found
set -euo pipefail
BASE_REF="${BASE_REF:-origin/main}"

if [ "$#" -eq 0 ]; then
  PATHS=()
  while IFS= read -r p; do PATHS+=("$p"); done < <(
    git log --format='%(trailers:key=Sync-Conflict,valueonly)' "$BASE_REF..HEAD" \
      | sed -nE 's/^(UU|AA) //p' | sort -u
  )
  [ "${#PATHS[@]}" -gt 0 ] || exit 0
  set -- "${PATHS[@]}"
fi

hits=0
for p in "$@"; do
  [ -f "$p" ] || continue
  if grep -HnE '^(<<<<<<<|>>>>>>>)( |$)' -- "$p"; then hits=1; fi
done
exit "$hits"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s .github/tests -p 'test_sync_ai_and_guard.py' -k TestMarkerGuard -v 2>&1 | tail -n 3`
Expected: `Ran 2 tests` … `OK`

- [ ] **Step 5: Lint and commit** (commit only once authorized)

```bash
shellcheck -S warning .github/scripts/check-sync-markers.sh
git add .github/tests/test_sync_ai_and_guard.py .github/scripts/check-sync-markers.sh
git commit -m "feat(sync): marker guard scoped to Sync-Conflict content paths"
```

---

### Task 3: AI resolver `ai-resolve.sh` + static prompt

**Files:**
- Create: `.github/prompts/resolve-conflicts.md`
- Create: `.github/scripts/ai-resolve.sh`
- Test: `TestAiResolve` in `.github/tests/test_sync_ai_and_guard.py` (written in Task 2)

**Interfaces:**
- Consumes:
  - the sync merge commit's `Sync-Conflict` trailers (Task 1);
  - `check-sync-markers.sh <path>` (Task 2);
  - env `COMMAND_CODE_API_KEY`, `SYNC_AI_MODEL`, `BASE_REF`, `SYNC_REPORT_DIR`.
- Produces:
  - at most one local commit `fix(sync): AI-resolve <R>/<C> conflicts via <model>` with a `Sync-AI-Resolved: <path>` trailer per resolved file;
  - report files `ai-transcript.txt` (key redacted), optional `ai-notes.md`, and `ai-gate.txt` (`pass`/`fail`) with `ai-gate.log`;
  - last stdout line `AI-SKIPPED <why>`, `AI-FAILED <why>` or `AI-RESOLVED <R>/<C>`.
  - Exit is always 0 (the marker commit is the fallback). **It never pushes.**

- [ ] **Step 1: Run the resolver tests and confirm they fail**

Run: `python3 -m unittest discover -s .github/tests -p 'test_sync_ai_and_guard.py' -k TestAiResolve -v 2>&1 | tail -n 4`
Expected: `FAILED (failures=7)`.

- [ ] **Step 2: Create the prompt**

Write `.github/prompts/resolve-conflicts.md` with exactly this content:

````markdown
You are resolving git merge conflicts in a fork of can1357/oh-my-pi, unattended in CI. Nobody will answer questions. Work only with the files and commands described here.

## Situation

- The current branch has a merge commit that pulls upstream `can1357/oh-my-pi` `main` into this fork, `LaansDole/research-harness`.
- That merge was committed with the conflict markers still in the files.
- Find the merge commit:

  ```sh
  M=$(git log --merges -1 --format=%H origin/main..HEAD)
  ```

- The conflicted files are listed in the `Sync-Conflict` trailers of that commit, one per line as `<code> <path>`:

  ```sh
  git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M"
  ```

- Only lines whose code is `UU` or `AA` are yours: those files contain conflict markers. Ignore every other code (`DU`, `UD`, `AU`, `UA`, `DD`). Those are file-level conflicts that a human decides.

## For each `UU`/`AA` file

1. Read all three versions:
   - fork (ours): `git show "$M^1:<path>"`
   - upstream (theirs): `git show "$M^2:<path>"`
   - common ancestor: `git show "$(git merge-base "$M^1" "$M^2"):<path>"`. It may not exist for `AA`.
2. Read the file in the working tree, which has the markers. Look at nearby code, and at other upstream changes (`git diff "$M^1" "$M^2" -- <related paths>`), when you need them to understand renamed symbols or moved code.
3. Edit the working-tree file so that it has **no** conflict marker lines (`<<<<<<< `, `=======`, `>>>>>>> `) and keeps both intents:
   - Upstream's change is the new baseline: keep its bug fixes, renames, new parameters and API changes.
   - Re-apply the fork's customization on top of that baseline. A fork change must never be silently dropped.
   - If the two sides really contradict each other and you can't keep both safely, don't guess. Leave that file's markers exactly as they are.
4. For every file you leave unresolved, append one line to the notes file:

   ```sh
   echo "- <path>: <one-sentence reason>" >> "$SYNC_REPORT_DIR/ai-notes.md"
   ```

## Hard rules

- Edit only the `UU`/`AA` files listed in the trailers. Changes to any other file are reverted automatically.
- Do not create files, except appending to `$SYNC_REPORT_DIR/ai-notes.md`.
- Do not run git commands that write: no `add`, `commit`, `checkout`, `reset`, `stash`, `merge`, `rebase`, `push`, `rm` or `restore`. Read-only commands (`show`, `diff`, `log`, `grep`, `blame`) are fine.
- Resolve each file completely or leave it untouched. A file that still has any marker line is reverted automatically.
- Do not print, write or echo environment variables or credentials.
- When you're done, reply with one line per file: `<path>: resolved` or `<path>: left for human`.
````

- [ ] **Step 3: Create the resolver**

Write `.github/scripts/ai-resolve.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# ai-resolve.sh — let a Command Code model (headless omp) resolve the content conflicts
# sync-upstream.sh committed with markers, then keep only what passes the guard.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md §3
#
# Commits locally, never pushes: the agent runs in a step without write credentials.
# Env: COMMAND_CODE_API_KEY (required; unset -> AI-SKIPPED)
#      SYNC_AI_MODEL   (default commandcode/z-ai/glm-5.3-flash)
#      BASE_REF        (default origin/main)
#      SYNC_REPORT_DIR (default <git-dir>/sync-report)
# Output (last line): AI-SKIPPED <why> | AI-FAILED <why> | AI-RESOLVED <R>/<C>
# Exit: 0 unless git itself breaks — the marker commit is always the fallback.
set -euo pipefail
export GIT_LITERAL_PATHSPECS=1

HERE=$(cd "$(dirname "$0")" && pwd)
MODEL="${SYNC_AI_MODEL:-commandcode/z-ai/glm-5.3-flash}"
BASE_REF="${BASE_REF:-origin/main}"
export SYNC_REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"
mkdir -p "$SYNC_REPORT_DIR"

M=$(git log --merges -1 --format=%H "$BASE_REF..HEAD")
[ -n "$M" ] || { echo "AI-SKIPPED no sync merge commit"; exit 0; }
TARGETS=()
while IFS= read -r p; do TARGETS+=("$p"); done < <(
  git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M" | sed -nE 's/^(UU|AA) //p'
)
C=${#TARGETS[@]}
[ "$C" -gt 0 ] || { echo "AI-SKIPPED no content conflicts"; exit 0; }
[ -n "${COMMAND_CODE_API_KEY:-}" ] || { echo "AI-SKIPPED COMMAND_CODE_API_KEY unset"; exit 0; }
command -v omp >/dev/null || { echo "AI-SKIPPED omp not installed"; exit 0; }
git diff --quiet HEAD || { echo "AI-SKIPPED worktree not clean"; exit 0; }

START=$(git rev-parse HEAD)
UNTRACKED_BEFORE=$(git ls-files --others --exclude-standard)

drop_new_untracked() {
  comm -13 <(printf '%s\n' "$UNTRACKED_BEFORE" | sort) \
    <(git ls-files --others --exclude-standard | sort) \
    | while IFS= read -r p; do
        [ -n "$p" ] || continue
        rm -f -- "$p"
        echo "UNTRACKED $p removed"
      done
}
redact() { # keep the key out of anything that may be uploaded as an artifact
  [ -f "$1" ] && KEY="$COMMAND_CODE_API_KEY" perl -pi -e 's/\Q$ENV{KEY}\E/[REDACTED]/g' "$1"
  return 0
}
is_target() {
  local t
  for t in "${TARGETS[@]}"; do [ "$t" = "$1" ] && return 0; done
  return 1
}

set +e
omp -p --no-session --auto-approve --model "$MODEL" "@$HERE/../prompts/resolve-conflicts.md" \
  > "$SYNC_REPORT_DIR/ai-transcript.txt" 2>&1
rc=$?
set -e
redact "$SYNC_REPORT_DIR/ai-transcript.txt"
redact "$SYNC_REPORT_DIR/ai-notes.md"

# Undo anything the agent committed or staged; the guard judges the worktree only.
git reset -q --soft "$START"
git reset -q

if [ "$rc" -ne 0 ]; then
  git reset -q --hard "$START"
  drop_new_untracked
  echo "AI-FAILED omp exited $rc"
  exit 0
fi

# --- guard: trust nothing the agent claims -----------------------------------
CHANGED=()
while IFS= read -r -d '' p; do CHANGED+=("$p"); done < <(git diff --name-only -z HEAD)
for p in ${CHANGED[@]+"${CHANGED[@]}"}; do
  is_target "$p" && continue
  git checkout -q HEAD -- "$p"
  echo "OUT-OF-SCOPE $p reverted"
done
drop_new_untracked

RESOLVED=()
for p in "${TARGETS[@]}"; do
  git diff --quiet HEAD -- "$p" && continue # untouched: markers stay
  if [ -f "$p" ] && bash "$HERE/check-sync-markers.sh" "$p" >/dev/null; then
    RESOLVED+=("$p")
  else
    git checkout -q HEAD -- "$p"
    echo "PARTIAL $p reverted"
  fi
done
R=${#RESOLVED[@]}
[ "$R" -gt 0 ] || { echo "AI-RESOLVED 0/$C"; exit 0; }

if grep -qF -- "$COMMAND_CODE_API_KEY" < <(git diff HEAD -- "${RESOLVED[@]}"); then
  git checkout -q HEAD -- "${RESOLVED[@]}"
  echo "AI-FAILED API key found in resolution — reverted"
  exit 0
fi

git add -- "${RESOLVED[@]}"
TRAILERS=()
for p in "${RESOLVED[@]}"; do TRAILERS+=(--trailer "Sync-AI-Resolved: $p"); done
git commit -q -m "fix(sync): AI-resolve $R/$C conflicts via $MODEL" "${TRAILERS[@]}"

# Research gate is reported, not enforced: only meaningful once no conflict remains.
TREE=$(git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M" | grep -cvE '^(UU|AA) |^$' || true)
if [ "$R" -eq "$C" ] && [ "$TREE" -eq 0 ]; then
  if bash research/tests/run.sh > "$SYNC_REPORT_DIR/ai-gate.log" 2>&1; then
    echo pass > "$SYNC_REPORT_DIR/ai-gate.txt"
  else
    echo fail > "$SYNC_REPORT_DIR/ai-gate.txt"
  fi
fi
echo "AI-RESOLVED $R/$C"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s .github/tests -p 'test_sync_ai_and_guard.py' -k TestAiResolve -v 2>&1 | tail -n 3`
Expected: `Ran 7 tests` … `OK`

- [ ] **Step 5: Real-model smoke** (needs `omp` on PATH and `COMMAND_CODE_API_KEY` exported; roughly 2 min, and it spends a few cents)

This is the only check that exercises the real omp flags (`-p --no-session --auto-approve --model … @prompt`) and real model behavior. Save as `/tmp/smoke_ai.py` and run `python3 /tmp/smoke_ai.py` from the repo root:

```python
import os, subprocess, sys, tempfile
sys.path.insert(0, ".github/tests")
from test_sync_upstream import Fixture
AI = os.path.abspath(".github/scripts/ai-resolve.sh")
base = "export function fetchData(url: string) {\n  return fetch(url);\n}\n"
fork = "export function fetchData(url: string, timeoutMs = 5000) {\n  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });\n}\n"
up = "export function loadData(url: string, retries = 3) {\n  return fetchWithRetry(url, retries);\n}\n"
assert os.environ.get("COMMAND_CODE_API_KEY"), "export COMMAND_CODE_API_KEY first"
tmp = tempfile.mkdtemp(prefix="smoke-ai-")
fx = Fixture(tmp, base_files={"src/data.ts": base})
fx.commit(fx.fork, "src/data.ts", fork, "fork: timeout")
fx.upstream_commit("src/data.ts", up, "upstream: rename + retries")
print("sync:", fx.run_script().stdout.strip().splitlines()[-1])
env = dict(os.environ, SYNC_AI_MODEL="commandcode/z-ai/glm-5.3-flash", SYNC_TEST_MARKER=fx.marker)
r = subprocess.run(["bash", AI], cwd=fx.fork, env=env, capture_output=True, text=True, timeout=1200)
print(r.stdout)
print(fx.git_out("log", "--format=%h %s%n%(trailers)", "-1"))
print(fx.git_out("show", "HEAD:src/data.ts"))
print("status:", repr(fx.git_out("status", "--porcelain")))
print("gate:", fx.report("ai-gate.txt") if os.path.exists(os.path.join(fx.fork, ".git/sync-report/ai-gate.txt")) else "n/a")
```

Expected, as observed while prototyping on 2026-09-27 (116 s):
```
sync: SYNCED branch=sync/upstream conflicts=1
AI-RESOLVED 1/1
… fix(sync): AI-resolve 1/1 conflicts via commandcode/z-ai/glm-5.3-flash
Sync-AI-Resolved: src/data.ts
export function loadData(url: string, retries = 3, timeoutMs = 5000) {
  return fetchWithRetry(url, retries, { signal: AbortSignal.timeout(timeoutMs) });
}
status: ''
gate: pass
```
The model's exact wording may differ. What must hold: upstream's `loadData`/`retries` **and** the fork's `timeoutMs` are both present, and status is empty. `AI-RESOLVED 0/1` with an `ai-notes.md` line is also a correct guard outcome, but record it: it means the model declined. Delete `/tmp/smoke_ai.py` afterwards.

- [ ] **Step 6: Lint and commit** (commit only once authorized)

```bash
shellcheck -S warning .github/scripts/ai-resolve.sh
git add .github/prompts/resolve-conflicts.md .github/scripts/ai-resolve.sh
git commit -m "feat(sync): guarded Command Code conflict resolver via headless omp"
```

---

### Task 4: PR body `sync-pr-body.sh`

**Files:**
- Create: `.github/scripts/sync-pr-body.sh`
- Test: `TestPrBody` in `.github/tests/test_sync_ai_and_guard.py` (written in Task 2)

**Interfaces:**
- Consumes:
  - trailers `Sync-Conflict`, `Sync-Ours` and `Sync-AI-Resolved`;
  - report files from Tasks 1 and 3;
  - `check-sync-markers.sh <path>`;
  - env `BASE_REF`, `SYNC_REPORT_DIR`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID` (the last three are optional).
- Produces:
  - `$SYNC_REPORT_DIR/pr-body.md`, under 60 000 bytes, where the table and overlap list are never truncated;
  - stdout `conflicts=<K> ai=<R>`, which the workflow uses for draft and label decisions.
  - Resolution cells: `AI (<sha>)`, `**UNRESOLVED**`, `resolved`, `**TREE: kept present — review**`, `**TREE: kept deleted — review**`, `ours (README policy)`.

- [ ] **Step 1: Run the body tests and confirm they fail**

Run: `python3 -m unittest discover -s .github/tests -p 'test_sync_ai_and_guard.py' -k TestPrBody -v 2>&1 | tail -n 4`
Expected: `FAILED (failures=2)`.

- [ ] **Step 2: Create the body builder**

Write `.github/scripts/sync-pr-body.sh` with exactly this content:

````bash
#!/usr/bin/env bash
# sync-pr-body.sh — write the sync PR body from git (trailers are the source of truth)
# plus the report files sync-upstream.sh / ai-resolve.sh left behind.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md §4
#
# Env: BASE_REF (default origin/main), SYNC_REPORT_DIR (default <git-dir>/sync-report),
#      GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID (links; optional)
# Writes: $SYNC_REPORT_DIR/pr-body.md
# Stdout: "conflicts=<K> ai=<R>" (K = non-README conflicts, R = AI-resolved files)
set -euo pipefail
export GIT_LITERAL_PATHSPECS=1

HERE=$(cd "$(dirname "$0")" && pwd)
BASE_REF="${BASE_REF:-origin/main}"
REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"
BODY="$REPORT_DIR/pr-body.md"
LIMIT=60000 # GitHub caps PR bodies at 65536 chars
mkdir -p "$REPORT_DIR"

M=$(git rev-list --merges --first-parent "$BASE_REF..HEAD" | tail -n 1)
[ -n "$M" ] || { echo "ERROR: no sync merge commit in $BASE_REF..HEAD" >&2; exit 1; }
MB=$(git merge-base "$M^1" "$M^2")
N=$(git rev-list --count "$M^1..$M^2")
AI_SHA=$(git log -1 --format=%h --grep='^Sync-AI-Resolved: ' "$BASE_REF..HEAD")
AI_MODEL=$(git log -1 --format=%s --grep='^Sync-AI-Resolved: ' "$BASE_REF..HEAD" | sed -n 's/.* via //p')
AI_PATHS=$(git log --format='%(trailers:key=Sync-AI-Resolved,valueonly)' "$BASE_REF..HEAD" | sed '/^$/d')
SERVER="${GITHUB_SERVER_URL:-https://github.com}"

ROWS="" K=0 R=0 U=0 T=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  code=${line%% *} p=${line#* }
  K=$((K + 1))
  case "$code" in
    UU | AA)
      if printf '%s\n' "$AI_PATHS" | grep -qxF -- "$p"; then
        cell="AI ($AI_SHA)"; R=$((R + 1))
      elif ! bash "$HERE/check-sync-markers.sh" "$p" >/dev/null; then
        cell="**UNRESOLVED**"; U=$((U + 1))
      else
        cell="resolved"
      fi ;;
    *)
      if [ -e "$p" ]; then cell="**TREE: kept present — review**"; else cell="**TREE: kept deleted — review**"; fi
      T=$((T + 1)) ;;
  esac
  ROWS+="| \`$p\` | $code | $cell |"$'\n'
done < <(git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M")
OURS=$(git log -1 --format='%(trailers:key=Sync-Ours,valueonly)' "$M" | sed '/^$/d')
if [ -n "$OURS" ]; then
  ROWS+="| \`README.md\` | ${OURS%% *} | ours (README policy) |"$'\n'
fi

section() { # <title> <file> <cap-bytes>: collapsed block, truncated to cap
  local title=$1 file=$2 cap=$3
  [ -s "$file" ] || return 0
  printf '<details><summary>%s</summary>\n\n````\n' "$title"
  if [ "$(wc -c < "$file")" -gt "$cap" ]; then
    head -c "$cap" "$file"
    printf '\n… truncated — full file in the run artifact `sync-report`\n'
  else
    cat "$file"
  fi
  printf '\n````\n\n</details>\n\n'
}

head_part() {
  echo "Automated upstream sync: \`$(git rev-parse --short "$MB")..$(git rev-parse --short "$M^2")\` — **$N upstream commits**."
  echo
  if [ "$K" -eq 0 ]; then
    echo "No conflicts outside \`README.md\`. \`research/tests/run.sh\` passed on the merge result."
  else
    echo "**$K conflicts** — content: $((K - T)) ($R AI-resolved, $U unresolved), tree: $T. This PR stays a draft until every **UNRESOLVED**/**TREE** row is handled."
  fi
  if [ -n "$AI_SHA" ]; then
    echo
    if [ -n "${GITHUB_REPOSITORY:-}" ]; then
      echo "AI resolution by \`$AI_MODEL\`: review it at $SERVER/$GITHUB_REPOSITORY/compare/$(git rev-parse --short "$M")..$AI_SHA"
    else
      echo "AI resolution by \`$AI_MODEL\`: review it with \`git diff $(git rev-parse --short "$M") $AI_SHA\`."
    fi
    if [ -f "$REPORT_DIR/ai-gate.txt" ]; then
      echo
      echo "Research tests after AI resolution: **$(cat "$REPORT_DIR/ai-gate.txt")**."
    fi
  fi
  if [ -n "$ROWS" ]; then
    printf '\n| path | type | resolution |\n| --- | --- | --- |\n%s' "$ROWS"
  fi
  if [ -s "$REPORT_DIR/ai-notes.md" ]; then
    printf '\n**AI notes**\n\n'
    cat "$REPORT_DIR/ai-notes.md"
  fi
  if [ -s "$REPORT_DIR/overlap.txt" ]; then
    printf '\n**Auto-merged files both sides changed** (check for silent semantic conflicts):\n\n'
    sed 's/.*/- `&`/' "$REPORT_DIR/overlap.txt"
  fi
  cat <<'EOF'

## Review

- [ ] Every **UNRESOLVED** / **TREE** row handled (push commits to `sync/upstream`)
- [ ] AI resolution reviewed via the compare link
- [ ] Auto-merged overlap files skimmed
- [ ] `sync-guard` check green

Merge with **Create a merge commit** so upstream history stays intact. Never click GitHub's "Discard N commits": that deletes the research layer.

EOF
  if [ -n "${GITHUB_RUN_ID:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
    echo "Full report: $SERVER/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID (artifact \`sync-report\`)."
    echo
  fi
}

HEAD_MD=$(head_part)
BUDGET=$(( (LIMIT - ${#HEAD_MD} - 600) / 3 ))
[ "$BUDGET" -gt 0 ] || BUDGET=0
{
  printf '%s\n\n' "$HEAD_MD"
  section "Upstream commits (shortlog)" "$REPORT_DIR/shortlog.txt" "$BUDGET"
  section "Upstream diffstat" "$REPORT_DIR/diffstat.txt" "$BUDGET"
  section "Raw conflict hunks (as committed)" "$REPORT_DIR/conflicts.diff" "$BUDGET"
} > "$BODY"

echo "conflicts=$K ai=$R"
````

- [ ] **Step 3: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s .github/tests -p 'test_sync_ai_and_guard.py' -k TestPrBody -v 2>&1 | tail -n 3`
Expected: `Ran 2 tests` … `OK`

- [ ] **Step 4: Lint and commit** (commit only once authorized)

```bash
shellcheck -S warning .github/scripts/sync-pr-body.sh
git add .github/scripts/sync-pr-body.sh
git commit -m "feat(sync): PR body with per-conflict resolution table and capped details"
```

---

### Task 5: Workflows `fork-sync.yml` + `sync-guard.yml`

**Files:**
- Modify: `.github/workflows/fork-sync.yml` (full replacement)
- Create: `.github/workflows/sync-guard.yml`

**Interfaces:**
- Consumes: the stdout contracts of every script above; secrets `FORK_SYNC_TOKEN` and `COMMAND_CODE_API_KEY`; variable `SYNC_AI_MODEL`.
- Produces: job `Sync guard / markers` (optionally made a required check by the user).

- [ ] **Step 1: Replace `fork-sync.yml`**

Write `.github/workflows/fork-sync.yml` with exactly this content:

```yaml
name: Fork sync

# Weekly merge of can1357/oh-my-pi:main into this fork + PR. Conflicts never stop the run:
# they are committed with markers (draft PR), optionally AI-resolved, and listed in the body.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md
# Scheduled workflows only run from the default branch; keep this on main.
on:
  schedule:
    - cron: '17 3 * * 1' # Mon 03:17 UTC = Mon 10:17 +07
  workflow_dispatch:
    inputs:
      ai:
        description: Let the Command Code model try to resolve content conflicts
        type: boolean
        default: true

# github.token stays read-only. Pushes and the PR use FORK_SYNC_TOKEN (contents +
# workflows + pull-requests write): github.token cannot push upstream's workflow-file
# changes, and PRs it opens never trigger ci.yml.
permissions:
  contents: read

concurrency:
  group: fork-sync
  cancel-in-progress: false

env:
  # Fork: gh defaults its base repo to the parent (can1357/oh-my-pi).
  # ponytail: GH_REPO pins every gh call to this fork.
  GH_REPO: ${{ github.repository }}
  BOT_EMAIL: 41898282+github-actions[bot]@users.noreply.github.com

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          # The AI step runs an agent: never leave a write token in .git/config.
          # Push auth is step-scoped via GIT_CONFIG_* env instead.
          persist-credentials: false

      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "$BOT_EMAIL"

      - name: Skip if the sync PR carries human commits
        id: preflight
        env:
          GH_TOKEN: ${{ secrets.FORK_SYNC_TOKEN }}
        run: |
          OPEN=$(gh pr list --head sync/upstream --state open --json number --jq 'length')
          TIP=$(git log -1 --format=%ae origin/sync/upstream 2>/dev/null || true)
          if [ "$OPEN" != "0" ] && [ -n "$TIP" ] && [ "$TIP" != "$BOT_EMAIL" ]; then
            echo "Sync PR has human commits (tip by $TIP) — skipping so they are never force-pushed away"
            echo "skip=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Merge upstream (conflicts captured)
        id: merge
        if: steps.preflight.outputs.skip != 'true'
        env:
          GIT_CONFIG_COUNT: 1
          GIT_CONFIG_KEY_0: url.https://x-access-token:${{ secrets.FORK_SYNC_TOKEN }}@github.com/.insteadOf
          GIT_CONFIG_VALUE_0: https://github.com/
        run: |
          OUT=$(bash .github/scripts/sync-upstream.sh) || { echo "$OUT"; exit 1; }
          echo "$OUT"
          if echo "$OUT" | grep -qx 'UP-TO-DATE'; then
            echo "status=up-to-date" >> "$GITHUB_OUTPUT"
          else
            echo "status=synced" >> "$GITHUB_OUTPUT"
            echo "conflicts=$(echo "$OUT" | sed -n 's/^SYNCED .* conflicts=\([0-9][0-9]*\)$/\1/p')" >> "$GITHUB_OUTPUT"
          fi

      - name: Decide AI resolution
        id: gate
        if: steps.merge.outputs.status == 'synced'
        env:
          CONFLICTS: ${{ steps.merge.outputs.conflicts }}
          HAS_KEY: ${{ secrets.COMMAND_CODE_API_KEY != '' }}
          # Not `inputs.ai != false`: on schedule inputs.ai is null, and null == false in
          # Actions' loose comparison, which would silently disable AI on every scheduled run.
          WANT: ${{ github.event_name == 'schedule' || inputs.ai }}
        run: |
          if [ "$CONFLICTS" != "0" ] && [ "$HAS_KEY" = "true" ] && [ "$WANT" = "true" ]; then
            echo "ai=true" >> "$GITHUB_OUTPUT"
          fi

      - uses: oven-sh/setup-bun@v2
        if: steps.gate.outputs.ai == 'true'

      - name: Install omp
        if: steps.gate.outputs.ai == 'true'
        run: |
          bun install -g @oh-my-pi/pi-coding-agent
          echo "$HOME/.bun/bin" >> "$GITHUB_PATH"

      - name: AI-resolve content conflicts
        if: steps.gate.outputs.ai == 'true'
        continue-on-error: true
        timeout-minutes: 20
        env:
          COMMAND_CODE_API_KEY: ${{ secrets.COMMAND_CODE_API_KEY }}
          SYNC_AI_MODEL: ${{ vars.SYNC_AI_MODEL }}
        run: bash .github/scripts/ai-resolve.sh

      - name: Push and open/update the sync PR
        if: steps.merge.outputs.status == 'synced'
        env:
          GH_TOKEN: ${{ secrets.FORK_SYNC_TOKEN }}
          GIT_CONFIG_COUNT: 1
          GIT_CONFIG_KEY_0: url.https://x-access-token:${{ secrets.FORK_SYNC_TOKEN }}@github.com/.insteadOf
          GIT_CONFIG_VALUE_0: https://github.com/
        run: |
          # Drop uncommitted leftovers of a killed/failed AI step: the body must describe
          # exactly what gets pushed. The AI commit (if any) fast-forwards the pushed branch.
          git reset -q --hard HEAD
          git push -q origin HEAD:sync/upstream
          STATS=$(bash .github/scripts/sync-pr-body.sh)
          K=$(echo "$STATS" | sed -n 's/^conflicts=\([0-9]*\) .*/\1/p')
          R=$(echo "$STATS" | sed -n 's/.* ai=\([0-9]*\)$/\1/p')
          BODY="$(git rev-parse --absolute-git-dir)/sync-report/pr-body.md"
          TITLE="Sync upstream can1357/oh-my-pi ($(date +%F))"
          PR=$(gh pr list --head sync/upstream --state open --json number --jq '.[0].number // empty')
          if [ -z "$PR" ]; then
            if [ "$K" -gt 0 ]; then DRAFT=--draft; else DRAFT=; fi
            # shellcheck disable=SC2086 # DRAFT is intentionally empty or one flag
            gh pr create --base main --head sync/upstream --title "$TITLE" --body-file "$BODY" $DRAFT
          else
            gh pr edit "$PR" --title "$TITLE" --body-file "$BODY"
            if [ "$K" -gt 0 ]; then gh pr ready "$PR" --undo || true; else gh pr ready "$PR" || true; fi
          fi
          gh label create sync-conflicts --color B60205 --description "Upstream sync has conflicts to review" --force
          gh label create ai-resolved --color 5319E7 --description "Conflicts resolved by the Command Code model" --force
          if [ "$K" -gt 0 ]; then
            gh pr edit sync/upstream --add-label sync-conflicts
          else
            gh pr edit sync/upstream --remove-label sync-conflicts || true
          fi
          if [ "$R" -gt 0 ]; then
            gh pr edit sync/upstream --add-label ai-resolved
          else
            gh pr edit sync/upstream --remove-label ai-resolved || true
          fi

      - name: Upload sync report
        if: always() && steps.merge.outcome != 'skipped'
        uses: actions/upload-artifact@v4
        with:
          name: sync-report
          path: .git/sync-report/
          include-hidden-files: true
          if-no-files-found: ignore
          retention-days: 30
```

- [ ] **Step 2: Create `sync-guard.yml`**

Write `.github/workflows/sync-guard.yml` with exactly this content:

```yaml
name: Sync guard

# Red while a sync PR still carries committed conflict markers in its Sync-Conflict files.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md
# Optional: make "Sync guard / markers" a required check on main via branch protection.
on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  markers:
    if: github.head_ref == 'sync/upstream'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false

      - name: No conflict markers left in sync conflict files
        env:
          BASE_REF: origin/main
        run: bash .github/scripts/check-sync-markers.sh
```

- [ ] **Step 3: Lint** (actionlint runs shellcheck on every `run:` block)

Run: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -no-color -oneline .github/workflows/fork-sync.yml .github/workflows/sync-guard.yml; echo "rc=$?"`
Expected: `rc=0` and nothing else.

- [ ] **Step 4: Commit** (only once authorized)

```bash
git add .github/workflows/fork-sync.yml .github/workflows/sync-guard.yml
git commit -m "ci(sync): draft PR on conflicts, credential-free AI step, marker guard check"
```

---

### Task 6: Docs + end-to-end verification

**Files:**
- Modify: `docs/ARCHITECTURE.md` §11 (lines 310 and 317)

- [ ] **Step 1: Update §11**

Replace line 310 (the paragraph starting `` `.github/workflows/fork-sync.yml` runs ``) with:

```markdown
`.github/workflows/fork-sync.yml` runs `.github/scripts/sync-upstream.sh` weekly. It merges `upstream/main` and keeps this fork's `README.md`, recorded as a `Sync-Ours` trailer. Every other conflict is committed **with its markers**, with one `Sync-Conflict: <code> <path>` trailer each. It then refreshes `docs/UPSTREAM.md`, runs the research test suite if nothing conflicted, and pushes `sync/upstream`. If the `COMMAND_CODE_API_KEY` secret is set, `.github/scripts/ai-resolve.sh` has headless omp (`vars.SYNC_AI_MODEL`, default `commandcode/z-ai/glm-5.3-flash`) resolve the content conflicts in a separate, guarded commit. That step has no GitHub write credential. `.github/scripts/sync-pr-body.sh` writes the PR body: the conflict table, auto-merged overlap files, and the upstream shortlog. Any conflict makes the PR a draft, and `.github/workflows/sync-guard.yml` stays red while markers remain. The README's **Staying in sync with upstream** note is the script's gate and its record: `sync-upstream.sh:43` aborts before merging if that line is missing, and `sync-upstream.sh:117` rewrites its sha and date afterwards.
```

Replace line 317 with:

```sh
git merge upstream/main                                           # README.md: keep ours; anything else: see the sync PR table
```

- [ ] **Step 2: Full suite, macOS**

Run: `bash .github/tests/run_tests.sh 2>&1 | tail -n 3`
Expected: `Ran 20 tests` … `OK`

- [ ] **Step 3: Full suite, CI shell (ubuntu-24.04: bash 5.2, git 2.43)**

Run:
```bash
docker run --rm -v "$PWD":/w -w /w ubuntu:24.04 bash -c 'apt-get update -qq >/dev/null && apt-get install -y -qq git python3 perl >/dev/null 2>&1 && python3 -m unittest discover -s .github/tests 2>&1 | tail -n 3'
```
Expected: `Ran 20 tests` … `OK`

- [ ] **Step 4: Research suite unchanged**

Run: `bash research/tests/run.sh 2>&1 | tail -n 3`
Expected: `OK (skipped=1)`

- [ ] **Step 5: Real-remote dry run** (throwaway worktree and branch; running a *copy* of the script, because `git checkout -B` swaps the file bash is reading)

```bash
cp .github/scripts/sync-upstream.sh /tmp/sync-upstream-new.sh
git worktree add -q --detach /tmp/rh-dryrun origin/main
(cd /tmp/rh-dryrun && SYNC_DRY_RUN=1 SYNC_BRANCH=dryrun/sync-check bash /tmp/sync-upstream-new.sh 2>&1 | tail -n 2)
git worktree remove --force /tmp/rh-dryrun && git branch -D dryrun/sync-check && rm /tmp/sync-upstream-new.sh
```
Expected, as observed on 2026-09-27 (upstream was 979 ahead; the numbers will grow): `OK (skipped=1)` from the research gate, then `DRY-RUN-OK branch=dryrun/sync-check conflicts=0 ahead_of_base=984`. The worktree's `sync-report/overlap.txt` listed `.gitignore`.

- [ ] **Step 6: Commit docs** (only once authorized)

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: describe conflict-capturing fork sync and AI resolver"
```

- [ ] **Step 7: Hand off the prerequisites and the post-merge check to the user**

These can't be done from the repo; list them in the final report:
1. Repo secret `COMMAND_CODE_API_KEY`: `gh secret set COMMAND_CODE_API_KEY --repo LaansDole/research-harness`.
2. `FORK_SYNC_TOKEN` must carry contents + **workflows** + pull-requests write (a classic PAT needs `repo` + `workflow`). Without workflows scope, the push fails with an explicit error now (it was hidden before), because upstream has changed `.github/workflows/ci.yml` and `bazel-cache-warm.yml`.
3. Optional: variable `SYNC_AI_MODEL`, and branch protection requiring `Sync guard / markers`.
4. Once this lands on `main` (scheduled workflows only run from the default branch), run `gh workflow run fork-sync.yml --repo LaansDole/research-harness` and confirm:
   - the run is green;
   - a **ready** (non-draft) PR opens, because today's only conflict is `README.md`;
   - its body shows the `.gitignore` overlap;
   - `CI` and `Sync guard` runs appear on the PR (proof that the token triggers workflows);
   - the run has a `sync-report` artifact.
