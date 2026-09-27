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
