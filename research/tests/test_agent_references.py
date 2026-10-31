"""Every reference doc a prompt tells an agent to read actually exists.

Failure mode this guards: a prompt names `references/<NAME>.md` that is in no
skill's references directory (typo, rename, file never committed). The agent's
read fails, the glob fallback matches nothing, and it silently screens or
writes a review without the methodology it was told to use -- no error
anywhere, just worse output.
"""
import glob
import os
import re
import unittest

import helpers

RESEARCH_DIR = os.path.abspath(os.path.join(helpers.TESTS_DIR, ".."))
SCAN_DIRS = ("agents", "prompts", "mode")
REFERENCES_DIRS = sorted(glob.glob(os.path.join(RESEARCH_DIR, "skills", "*", "references")))
REF_RE = re.compile(r"references/([A-Za-z0-9._-]+\.md)")


def in_url(text, start):
    """True if the match at `start` is part of an http(s) URL, not a skill path."""
    if start == 0 or text[start - 1].isspace():
        return False
    token = text[:start].rsplit(maxsplit=1)[-1]
    return "http://" in token or "https://" in token


def referenced_docs():
    """{referenced filename: [prompt files naming it]}, URLs excluded."""
    found = {}
    for subdir in SCAN_DIRS:
        root = os.path.join(RESEARCH_DIR, subdir)
        for name in sorted(os.listdir(root)):
            if not name.endswith(".md"):
                continue
            with open(os.path.join(root, name), encoding="utf-8") as fh:
                text = fh.read()
            for match in REF_RE.finditer(text):
                if in_url(text, match.start()):
                    continue
                found.setdefault(match.group(1), set()).add(f"{subdir}/{name}")
    return found


class AgentReferences(unittest.TestCase):
    def test_referenced_docs_resolve(self):
        refs = referenced_docs()
        self.assertTrue(
            refs,
            "no references/<NAME>.md path found in research/{agents,prompts,mode}/*.md -- "
            "the extraction below stopped matching, so this test checks nothing",
        )
        missing = {
            ref: sorted(who)
            for ref, who in refs.items()
            if not any(os.path.isfile(os.path.join(d, ref)) for d in REFERENCES_DIRS)
        }
        self.assertEqual(
            missing,
            {},
            f"prompts point at reference docs absent from every {RESEARCH_DIR}/skills/*/references: "
            f"{missing}",
        )


if __name__ == "__main__":
    unittest.main()
