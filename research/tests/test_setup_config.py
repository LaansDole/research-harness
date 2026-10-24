"""setup.sh config.env persistence: managed keys refreshed, the rest preserved.

Runs the real setup.sh against a scratch HOME with a stub `omp` on PATH, so no
plugin, agent, or launcher state outside the temp dir is touched.
"""
import os
import re
import subprocess
import unittest

import helpers

REPO = os.path.abspath(os.path.join(helpers.TESTS_DIR, "..", ".."))
SETUP = os.path.join(REPO, "setup.sh")


def config_value(text, key):
    m = re.search(rf'^{key}="?(.*?)"?$', text, re.M)
    return m.group(1) if m else None


class SetupConfigTest(helpers.ResearchCase):
    def run_setup(self):
        home = os.path.join(self.dir, "home")
        stub_bin = os.path.join(self.dir, "bin")
        os.makedirs(stub_bin, exist_ok=True)
        stub = os.path.join(stub_bin, "omp")
        if not os.path.exists(stub):
            with open(stub, "w", encoding="utf-8") as fh:
                fh.write("#!/bin/sh\nexit 0\n")
            os.chmod(stub, 0o755)
        env = dict(os.environ, HOME=home, PATH=f"{stub_bin}:{os.environ['PATH']}")
        env.pop("RESEARCH_CORPUS_DIR", None)
        env.pop("PAPER_GRAPH_DB", None)
        proc = subprocess.run(["bash", SETUP], env=env, capture_output=True,
                              text=True, stdin=subprocess.DEVNULL)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.config = os.path.join(home, ".research-harness", "config.env")
        with open(self.config, encoding="utf-8") as fh:
            return fh.read()

    def test_regression_config_env_preserves_unmanaged_keys(self):
        self.run_setup()
        with open(self.config, "a", encoding="utf-8") as fh:
            fh.write('TYPESAFE_API_KEY="secret-key"\n')
            fh.write('RERANK_URL="http://127.0.0.1:8091"\n')
        # A customized brand name is unmanaged too: step 6 must not reset it.
        with open(self.config, encoding="utf-8") as fh:
            first = fh.read()
        with open(self.config, "w", encoding="utf-8") as fh:
            fh.write(first.replace('RESEARCHHARNESS_BRAND_NAME="Research Harness"',
                                   'RESEARCHHARNESS_BRAND_NAME="My Lab"'))

        text = self.run_setup()

        self.assertEqual(config_value(text, "TYPESAFE_API_KEY"), "secret-key")
        self.assertEqual(config_value(text, "RERANK_URL"), "http://127.0.0.1:8091")
        self.assertEqual(config_value(text, "RESEARCHHARNESS_BRAND_NAME"), "My Lab")
        # Managed keys are still rewritten to the live values.
        self.assertEqual(config_value(text, "RESEARCH_HARNESS_HOME"), REPO)
        self.assertEqual(text.count("RESEARCH_HARNESS_HOME="), 1)
        self.assertEqual(text.count("RESEARCHHARNESS_BRAND_NAME="), 1)


if __name__ == "__main__":
    unittest.main()
