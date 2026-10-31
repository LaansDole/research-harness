"""Every reference doc an agent prompt tells the agent to read actually exists.

Failure mode this guards: a prompt names `references/<NAME>.md` that is not in
the literature-search skill's references directory (typo, rename, file never
committed). The agent's read fails, the glob fallback matches nothing, and it
silently screens or writes a review without the methodology it was told to use
-- no error anywhere, just worse output.
"""
import os
import re
import unittest

import helpers

AGENTS_DIR = os.path.abspath(os.path.join(helpers.TESTS_DIR, "..", "agents"))
REFERENCES_DIR = os.path.abspath(
    os.path.join(helpers.TESTS_DIR, "..", "skills", "literature-search", "references")
)
REF_RE = re.compile(r"references/([A-Za-z0-9._-]+\.md)")


def referenced_docs():
    """{referenced filename: [agent prompt files naming it]}."""
    found = {}
    for name in sorted(os.listdir(AGENTS_DIR)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(AGENTS_DIR, name), encoding="utf-8") as fh:
            text = fh.read()
        for ref in REF_RE.findall(text):
            found.setdefault(ref, set()).add(name)
    return found


class AgentReferences(unittest.TestCase):
    def test_referenced_docs_resolve(self):
        refs = referenced_docs()
        self.assertTrue(
            refs,
            "no references/<NAME>.md path found in research/agents/*.md -- "
            "the extraction below stopped matching, so this test checks nothing",
        )
        missing = {
            ref: sorted(who)
            for ref, who in refs.items()
            if not os.path.isfile(os.path.join(REFERENCES_DIR, ref))
        }
        self.assertEqual(
            missing,
            {},
            f"agent prompts point at reference docs absent from {REFERENCES_DIR}: {missing}",
        )


if __name__ == "__main__":
    unittest.main()
