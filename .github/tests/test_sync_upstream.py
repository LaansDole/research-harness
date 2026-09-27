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
