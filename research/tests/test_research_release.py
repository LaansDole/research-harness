"""Contract tests for .github/scripts/research-release.sh (the release workflow's work):
it moves [Unreleased] entries under the new version, bumps research/VERSION, and refuses
releases that would mislabel what researchers see on `research update`."""
import os
import shutil
import subprocess
import unittest

import helpers

REPO_ROOT = os.path.abspath(os.path.join(helpers.TESTS_DIR, "..", ".."))
SCRIPT_REL = ".github/scripts/research-release.sh"
CHANGELOG = """# Changelog

## [Unreleased]

### Added

- new-thing

## [0.1.0] - 2026-10-31

- old-thing
"""


class ResearchReleaseTest(helpers.ResearchCase):
    def setUp(self):
        super().setUp()
        self.root = os.path.realpath(self.dir)
        os.makedirs(os.path.join(self.root, ".github/scripts"))
        os.makedirs(os.path.join(self.root, "research"))
        shutil.copy2(os.path.join(REPO_ROOT, SCRIPT_REL),
                     os.path.join(self.root, SCRIPT_REL))
        self.write("research/VERSION", "0.1.0\n")
        self.write("research/CHANGELOG.md", CHANGELOG)

    def write(self, rel, text):
        with open(os.path.join(self.root, rel), "w", encoding="utf-8") as fh:
            fh.write(text)

    def read(self, rel):
        with open(os.path.join(self.root, rel), encoding="utf-8") as fh:
            return fh.read()

    def release(self, version):
        return subprocess.run(["bash", os.path.join(self.root, SCRIPT_REL), version],
                              capture_output=True, text=True)

    def test_moves_unreleased_entries_under_the_new_version(self):
        proc = self.release("0.2.0")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(self.read("research/VERSION"), "0.2.0\n")
        log = self.read("research/CHANGELOG.md")
        # Fresh empty [Unreleased] on top, new-thing now under 0.2.0, 0.1.0 untouched.
        unreleased, rest = log.split("## [Unreleased]\n", 1)[1].split("## [0.2.0] - ", 1)
        self.assertEqual(unreleased.strip(), "")
        self.assertIn("- new-thing", rest.split("## [0.1.0]")[0])
        self.assertTrue(rest.endswith("## [0.1.0] - 2026-10-31\n\n- old-thing\n"))
        self.assertEqual(proc.stdout, "### Added\n\n- new-thing\n")

    def test_refuses_and_changes_nothing(self):
        cases = {
            "0.1.0": "not newer",       # same version
            "0.0.9": "not newer",       # older
            "0.10": "must look like",   # malformed
        }
        for version, why in cases.items():
            with self.subTest(version=version):
                proc = self.release(version)
                self.assertNotEqual(proc.returncode, 0)
                self.assertIn(why, proc.stderr)
        self.write("research/CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n### Added\n\n"
                                         "## [0.1.0] - 2026-10-31\n\n- old-thing\n")
        proc = self.release("0.2.0")
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("no entries", proc.stderr)
        self.assertEqual(self.read("research/VERSION"), "0.1.0\n")

    def test_minor_bump_beats_larger_patch(self):
        # Numeric, not string, comparison: 0.10.0 is newer than 0.9.5.
        self.write("research/VERSION", "0.9.5\n")
        self.assertEqual(self.release("0.10.0").returncode, 0)


if __name__ == "__main__":
    unittest.main()
