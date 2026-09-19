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
