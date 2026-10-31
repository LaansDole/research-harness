"""`research update`: git-based self-update of the harness checkout.

Every test builds a throwaway bare "remote" plus a clone carrying a minimal copy
of the harness (launcher, the real setup.sh, agents, prompts, mode prompt), a
scratch HOME and a stub `omp` on PATH — so nothing outside the temp dir is read
or written and the whole thing stays offline (the remote is a local path).
"""
import os
import shlex
import shutil
import subprocess
import unittest

import helpers

REPO_ROOT = os.path.abspath(os.path.join(helpers.TESTS_DIR, "..", ".."))
# bin/research doctor fails unless these four agents are installed.
AGENTS = ("scholar", "screener", "synthesizer", "librarian")
# A tracked build artifact: the root `bun install` postinstall rewrites it per
# machine, so `research update` must treat it as regenerable, not as a user edit.
GENERATED_REL = "packages/coding-agent/src/export/html/viewer.generated.json"
OMP_STUB = """#!/bin/sh
if [ "$1" = plugin ] && [ "$2" = list ]; then echo research-harness-tools; fi
if [ "$1" = --version ]; then echo 0.0.0-test; fi
exit 0
"""


def write(path, text, mode=0o644):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.chmod(path, mode)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


class ResearchUpdateTest(helpers.ResearchCase):
    def setUp(self):
        super().setUp()
        root = os.path.realpath(self.dir)
        self.home = os.path.join(root, "home")
        self.config = os.path.join(self.home, ".research-harness", "config.env")
        # doctor checks the installed plugin extension; setup.sh never creates it.
        write(os.path.join(self.home, ".omp/plugins/node_modules/"
                           "research-harness-tools/extensions/research-mode/index.ts"),
              "// stub\n")
        self.stub_bin = os.path.join(root, "stub-bin")
        self.bun_log = os.path.join(root, "bun.log")
        write(os.path.join(self.stub_bin, "omp"), OMP_STUB, 0o755)

        self.env = dict(os.environ, HOME=self.home,
                        PATH=self.stub_bin + os.pathsep + os.environ["PATH"],
                        GIT_AUTHOR_NAME="test", GIT_AUTHOR_EMAIL="test@example.com",
                        GIT_COMMITTER_NAME="test", GIT_COMMITTER_EMAIL="test@example.com")
        for k in ("RESEARCH_HARNESS_HOME", "PAPER_GRAPH_DB", "RESEARCH_CORPUS_DIR",
                  "RESEARCH_HARNESS_OMP", "OMP_AGENT_DIR"):
            self.env.pop(k, None)

        self.remote = os.path.join(root, "remote.git")
        self.upstream = os.path.join(root, "upstream")
        self.repo = os.path.join(root, "repo")
        self.git("-c", "init.defaultBranch=main", "init", "-q", "--bare", self.remote,
                 cwd=root)
        os.makedirs(self.upstream)
        self.git("-c", "init.defaultBranch=main", "init", "-q", cwd=self.upstream)
        for rel in ("bin/research", "setup.sh"):
            dst = os.path.join(self.upstream, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(REPO_ROOT, rel), dst)
        for agent in AGENTS:
            write(os.path.join(self.upstream, "research/agents", agent + ".md"),
                  "# %s\n" % agent)
        write(os.path.join(self.upstream, "research/prompts/lit-review.md"), "# lit\n")
        write(os.path.join(self.upstream, "research/mode/system.md"), "# mode\n")
        write(os.path.join(self.upstream, GENERATED_REL),
              '{"bundle": "viewer-committed.js"}\n')
        self.git("add", "-A", cwd=self.upstream)
        self.git("commit", "-q", "-m", "initial", cwd=self.upstream)
        self.git("remote", "add", "origin", self.remote, cwd=self.upstream)
        self.git("push", "-q", "origin", "main", cwd=self.upstream)
        self.git("clone", "-q", self.remote, self.repo, cwd=root)

    # --- fixture plumbing -------------------------------------------------
    def git(self, *args, cwd):
        return subprocess.run(["git", *args], cwd=cwd, env=self.env, check=True,
                              capture_output=True, text=True)

    def head(self, repo=None):
        return self.git("rev-parse", "HEAD", cwd=repo or self.repo).stdout.strip()

    def research(self, *args):
        return subprocess.run(["bash", os.path.join(self.repo, "bin", "research"), *args],
                              cwd=self.repo, env=self.env, stdin=subprocess.DEVNULL,
                              capture_output=True, text=True)

    def push_commit(self, subject="add a prompt", name="newcmd"):
        write(os.path.join(self.upstream, "research/prompts", name + ".md"),
              "# %s\n" % name)
        self.git("add", "-A", cwd=self.upstream)
        self.git("commit", "-q", "-m", subject, cwd=self.upstream)
        self.git("push", "-q", "origin", "main", cwd=self.upstream)
        return self.head(self.upstream)

    def fake_bun(self, rewrites_generated=False, fails=False):
        """A `bun` on PATH that logs its args, optionally mimicking the real
        postinstall (rewrites the tracked artifact) or a failing install."""
        lines = ["#!/bin/sh", 'echo "bun $*" >> %s' % shlex.quote(self.bun_log)]
        if rewrites_generated:
            lines.append("printf '{\"bundle\": \"viewer-local.js\"}\\n' > %s"
                         % shlex.quote(os.path.join(self.repo, GENERATED_REL)))
        if fails:
            lines += ['echo "error: lockfile needs --frozen-lockfile" >&2', "exit 1"]
        write(os.path.join(self.stub_bin, "bun"), "\n".join(lines) + "\nexit 0\n", 0o755)

    def dirty_generated(self, bundle="viewer-local.js"):
        write(os.path.join(self.repo, GENERATED_REL), '{"bundle": "%s"}\n' % bundle)

    def rebuild_history(self):
        """Force-push a rewritten main, as the fork's daily rebase-stack sync does."""
        self.git("commit", "-q", "--amend", "-m", "rebuilt stack", cwd=self.upstream)
        self.git("push", "-q", "--force", "origin", "main", cwd=self.upstream)
        return self.head(self.upstream)

    def installed_prompt(self, name):
        return os.path.join(self.home, ".omp/agent/prompts", name + ".md")

    # --- contracts --------------------------------------------------------
    def test_check_reports_pending_commits_and_changes_nothing(self):
        before = self.head()
        self.push_commit(subject="add the demo prompt")
        write(self.config, 'TYPESAFE_API_KEY="secret"\n')

        proc = self.research("update", "--check")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("1 new commits available", proc.stdout)
        self.assertIn("add the demo prompt", proc.stdout)
        self.assertEqual(self.head(), before)
        self.assertFalse(os.path.exists(
            os.path.join(self.repo, "research/prompts/newcmd.md")))
        self.assertFalse(os.path.exists(self.installed_prompt("newcmd")))
        self.assertEqual(read(self.config), 'TYPESAFE_API_KEY="secret"\n')

    def test_fast_forward_moves_to_the_remote_tip_and_reinstalls(self):
        tip = self.push_commit()

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(self.head(), tip)
        # setup.sh ran after the move: the brand-new prompt is installed.
        self.assertTrue(os.path.exists(self.installed_prompt("newcmd")))
        self.assertIn("research-harness updated", proc.stdout)

    def test_up_to_date_update_still_refreshes_the_install(self):
        """Regression: update() returned early when FETCH_HEAD == HEAD, so a
        drifted installed agent stayed drifted until setup.sh was run by hand."""
        installed = os.path.join(self.home, ".omp/agent/agents/scholar.md")
        write(installed, "# drifted scholar\n")
        before = self.head()

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("already up to date", proc.stdout)
        self.assertEqual(self.head(), before)
        self.assertEqual(read(installed), "# scholar\n")

    def test_check_installs_nothing_when_already_up_to_date(self):
        proc = self.research("update", "--check")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("already up to date", proc.stdout)
        self.assertFalse(os.path.exists(self.installed_prompt("lit-review")))

    def test_doctor_flags_drifted_installed_files_until_update_refreshes_them(self):
        self.assertEqual(self.research("update").returncode, 0)
        write(os.path.join(self.home, ".omp/agent/agents/screener.md"), "# drifted\n")
        os.remove(self.installed_prompt("lit-review"))

        stale = self.research("doctor")

        self.assertIn("2 installed file(s) differ from the checkout", stale.stdout)
        self.assertIn("agents/screener.md", stale.stdout)
        self.assertIn("prompts/lit-review.md", stale.stdout)
        self.assertIn("run 'research update'", stale.stdout)

        self.assertEqual(self.research("update").returncode, 0)
        fresh = self.research("doctor")

        self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
        self.assertIn("installed agents/prompts match the checkout (5 files)",
                      fresh.stdout)

    def test_update_reports_old_and_new_harness_version(self):
        # The pre-VERSION commit must read "unknown", not borrow the local file.
        write(os.path.join(self.upstream, "research/VERSION"), "0.2.0\n")
        tip = self.push_commit()

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("updated unknown (", proc.stdout)
        self.assertIn("-> 0.2.0 (%s)" % tip[:7], proc.stdout)
        up = self.research("update")
        self.assertIn("already up to date: 0.2.0 (%s)" % tip[:7], up.stdout)

    def test_force_pushed_remote_lands_on_new_tip_and_prints_the_old_sha(self):
        old = self.head()
        tip = self.rebuild_history()

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(self.head(), tip)
        self.assertIn(old[:7], proc.stdout)

    def test_force_pushed_remote_uses_main_prev_when_the_tracking_ref_moved(self):
        old = self.head()
        tip = self.rebuild_history()
        self.git("push", "-q", "--force", "origin", old + ":refs/heads/main-prev",
                 cwd=self.upstream)
        # A plain fetch first: origin/main no longer proves the local tip was clean.
        self.git("fetch", "-q", "origin", cwd=self.repo)

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(self.head(), tip)

    def test_local_commit_is_never_discarded_by_a_force_pushed_remote(self):
        write(os.path.join(self.repo, "research/prompts/mine.md"), "# mine\n")
        self.git("add", "-A", cwd=self.repo)
        self.git("commit", "-q", "-m", "my own tweak", cwd=self.repo)
        mine = self.head()
        self.rebuild_history()

        proc = self.research("update")

        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(self.head(), mine)
        self.assertIn("my own tweak", proc.stderr)

    def test_uncommitted_change_blocks_the_update(self):
        before = self.head()
        edited = os.path.join(self.repo, "research/mode/system.md")
        write(edited, "# my edit\n")
        self.push_commit()

        proc = self.research("update")

        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(read(edited), "# my edit\n")
        self.assertEqual(self.head(), before)

    def test_other_branch_blocks_the_update(self):
        self.git("checkout", "-q", "-b", "my-experiment", cwd=self.repo)
        before = self.head()
        self.push_commit()

        proc = self.research("update")

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("my-experiment", proc.stderr)
        self.assertEqual(self.head(), before)

    def test_hand_added_config_keys_survive_a_full_update(self):
        setup = subprocess.run(["bash", os.path.join(self.repo, "setup.sh")],
                               cwd=self.repo, env=self.env, stdin=subprocess.DEVNULL,
                               capture_output=True, text=True)
        self.assertEqual(setup.returncode, 0, setup.stderr)
        with open(self.config, "a", encoding="utf-8") as fh:
            fh.write('TYPESAFE_API_KEY="secret-key"\n')
        self.push_commit()

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        text = read(self.config)
        self.assertIn('TYPESAFE_API_KEY="secret-key"', text)
        self.assertIn('RESEARCH_HARNESS_HOME="%s"' % self.repo, text)

    def test_generated_build_artifact_is_rebuilt_instead_of_blocking(self):
        self.fake_bun()
        self.dirty_generated()
        # the incoming commit ships a new manifest for the same file: without the
        # discard, git refuses the move rather than overwriting the local copy.
        write(os.path.join(self.upstream, GENERATED_REL), '{"bundle": "viewer-next.js"}\n')
        tip = self.push_commit()

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(self.head(), tip)
        self.assertEqual(read(os.path.join(self.repo, GENERATED_REL)),
                         '{"bundle": "viewer-next.js"}\n')
        # then rebuilt for this machine
        self.assertIn("bun install", read(self.bun_log))

    def test_generated_artifact_plus_a_real_edit_still_blocks(self):
        self.fake_bun()
        before = self.head()
        self.dirty_generated()
        edited = os.path.join(self.repo, "research/mode/system.md")
        write(edited, "# my edit\n")
        self.push_commit()

        proc = self.research("update")

        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(self.head(), before)
        self.assertEqual(read(edited), "# my edit\n")
        self.assertEqual(read(os.path.join(self.repo, GENERATED_REL)),
                         '{"bundle": "viewer-local.js"}\n')
        self.assertIn("system.md", proc.stderr)
        self.assertFalse(os.path.exists(self.bun_log))

    def test_regression_generated_artifact_does_not_block_next_update(self):
        """`bun install` rewrites the tracked viewer manifest on machines whose
        bundle differs from the committed one; that made every later
        `research update` refuse with "edits that are not saved in git"."""
        self.fake_bun(rewrites_generated=True)
        self.dirty_generated("viewer-stale.js")
        first = self.push_commit(name="first")

        one = self.research("update")

        self.assertEqual(one.returncode, 0, one.stdout + one.stderr)
        self.assertEqual(self.head(), first)
        self.assertEqual(read(os.path.join(self.repo, GENERATED_REL)),
                         '{"bundle": "viewer-local.js"}\n', "postinstall must re-dirty it")

        second = self.push_commit(name="second")
        two = self.research("update")

        self.assertEqual(two.returncode, 0, two.stdout + two.stderr)
        self.assertEqual(self.head(), second)
        self.assertNotIn("not saved in git", two.stderr)

    def test_failed_bun_install_shows_bun_own_error(self):
        self.fake_bun(fails=True)
        before = self.head()
        self.dirty_generated()
        self.push_commit()

        proc = self.research("update")

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("lockfile needs --frozen-lockfile", proc.stderr)
        self.assertIn("run it there by hand", proc.stderr)
        self.assertNotEqual(self.head(), before, "HEAD already moved when install failed")

    def test_force_push_counts_only_the_commits_that_are_new(self):
        self.push_commit(subject="shared work", name="shared")
        self.assertEqual(self.research("update").returncode, 0)
        # the rebase-stack sync re-creates the same commit under a new sha...
        self.git("commit", "-q", "--amend", "-m", "shared work (rebuilt)",
                 cwd=self.upstream)
        # ...and adds one commit that is genuinely new.
        write(os.path.join(self.upstream, "research/prompts/fresh.md"), "# fresh\n")
        self.git("add", "-A", cwd=self.upstream)
        self.git("commit", "-q", "-m", "only new work", cwd=self.upstream)
        self.git("push", "-q", "--force", "origin", "main", cwd=self.upstream)
        tip = self.head(self.upstream)

        proc = self.research("update")

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(self.head(), tip)
        self.assertIn("(1 new commits)", proc.stdout)


if __name__ == "__main__":
    unittest.main()
