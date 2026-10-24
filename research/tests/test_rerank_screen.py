"""rerank_screen: aggregate, skips, idempotency, and the never-decides contract.

Offline: the rerank HTTP boundary is replaced per test; helpers' network guard
catches anything that slips through.
"""
import json
import os
import unittest
from unittest import mock

import helpers
import rerank_client
import rerank_screen
import review

CRITERIA = {"Population": "adults in hospital care", "Concept": "multi-agent LLM systems"}


def fake_rerank(score_table, truncated=()):
    """Stand-in for rerank_client.rerank: score_table[criterion][title] -> score."""

    def call(url, query, docs, top_n=None, budget=None, timeout=None):
        scores = score_table[query]
        results = sorted(((i, scores[d.split("\n")[0]]) for i, d in enumerate(docs)),
                         key=lambda p: -p[1])
        return rerank_client.RerankScores(results, "test-reranker", list(truncated), 7)

    return call


class RerankScreenCase(helpers.ResearchCase):
    def setUp(self):
        super().setUp()
        self.pdir = os.path.join(self.dir, "proj")
        self.criteria_path = os.path.join(self.pdir, "criteria.json")
        con = review.connect(self.pdir)
        ts = review.now()
        for rid, title, abstract in (
            ("r1", "Multi-agent LLM triage in hospital wards", "Agents coordinate triage."),
            ("r2", "Crop disease detection with CNNs", "Leaf images classified."),
            ("r3", "No abstract record", ""),
        ):
            con.execute(
                "INSERT INTO records (id, import_key, source_db, title, abstract, state,"
                " created_at, updated_at) VALUES (?,?,?,?,?,'identified',?,?)",
                (rid, rid, "seed", title, abstract, ts, ts))
        con.commit()
        con.close()
        self.write_criteria(CRITERIA)
        os.environ["RERANK_URL"] = "http://127.0.0.1:8091"
        self.addCleanup(os.environ.pop, "RERANK_URL", None)

    def write_criteria(self, criteria):
        with open(self.criteria_path, "w", encoding="utf-8") as fh:
            json.dump(criteria, fh)

    def score(self, table, argv=(), truncated=()):
        with mock.patch.object(rerank_screen.rerank_client, "rerank",
                               fake_rerank(table, truncated)):
            return helpers.run_cli(rerank_screen,
                                   ["score", "--project", self.pdir] + list(argv))

    def rows(self):
        con = review.connect(self.pdir)
        try:
            return [dict(r) for r in con.execute(
                "SELECT * FROM rerank_scores ORDER BY record_id, criteria_hash")]
        except Exception:  # table absent
            return None
        finally:
            con.close()

    def store_snapshot(self):
        con = review.connect(self.pdir)
        snap = (list(con.execute("SELECT * FROM records ORDER BY id")),
                list(con.execute("SELECT * FROM history ORDER BY seq")))
        con.close()
        return snap


MIN_TABLE = {
    "adults in hospital care": {"Multi-agent LLM triage in hospital wards": 0.9,
                                "Crop disease detection with CNNs": 0.2},
    "multi-agent LLM systems": {"Multi-agent LLM triage in hospital wards": 0.7,
                                "Crop disease detection with CNNs": 0.01},
}


class ScoreTest(RerankScreenCase):
    def test_min_mode_aggregates_the_weakest_criterion(self):
        code, out, _ = self.score(MIN_TABLE)
        self.assertEqual(code, 0)
        rows = {r["record_id"]: r for r in self.rows()}
        self.assertAlmostEqual(rows["r1"]["score"], 0.7)
        self.assertAlmostEqual(rows["r2"]["score"], 0.01)
        self.assertEqual(json.loads(rows["r1"]["per_criterion"]),
                         {"Population": 0.9, "Concept": 0.7})
        summary = json.loads(out.strip().splitlines()[-1])
        self.assertEqual(summary["scored"], 2)
        self.assertEqual(summary["mode"], "min")
        self.assertEqual(summary["model"], "test-reranker")

    def test_records_without_an_abstract_are_skipped(self):
        _, out, _ = self.score(MIN_TABLE)
        self.assertNotIn("r3", {r["record_id"] for r in self.rows()})
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["skipped_no_abstract"], 1)

    def test_joint_mode_sends_one_query_with_every_criterion(self):
        joint = " ".join(CRITERIA.values())
        table = {joint: {"Multi-agent LLM triage in hospital wards": 0.8,
                         "Crop disease detection with CNNs": 0.05}}
        code, out, _ = self.score(table, ["--mode", "joint"])
        self.assertEqual(code, 0)
        rows = {r["record_id"]: r for r in self.rows()}
        self.assertAlmostEqual(rows["r1"]["score"], 0.8)
        self.assertIsNone(rows["r1"]["per_criterion"])
        self.assertEqual(rows["r1"]["mode"], "joint")

    def test_truncated_records_are_flagged(self):
        _, out, _ = self.score(MIN_TABLE, truncated=[0])
        rows = {r["record_id"]: r for r in self.rows()}
        self.assertEqual(rows["r1"]["truncated"], 1)
        self.assertEqual(rows["r2"]["truncated"], 0)
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["truncated"], 1)

    def test_rerun_scores_nothing_new_until_force(self):
        self.score(MIN_TABLE)
        _, out, _ = self.score(MIN_TABLE)
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["scored"], 0)
        _, out, _ = self.score(MIN_TABLE, ["--force"])
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["scored"], 2)
        self.assertEqual(len(self.rows()), 2)

    def test_edited_criteria_rescore_under_a_new_hash_and_keep_the_old_rows(self):
        self.score(MIN_TABLE)
        old_hash = self.rows()[0]["criteria_hash"]
        edited = dict(CRITERIA, Concept="single-agent chatbots")
        self.write_criteria(edited)
        table = {edited["Population"]: MIN_TABLE["adults in hospital care"],
                 edited["Concept"]: {"Multi-agent LLM triage in hospital wards": 0.1,
                                     "Crop disease detection with CNNs": 0.02}}
        _, out, _ = self.score(table)
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["scored"], 2)
        hashes = {r["criteria_hash"] for r in self.rows()}
        self.assertEqual(len(hashes), 2)
        self.assertIn(old_hash, hashes)
        new = {r["record_id"]: r for r in self.rows() if r["criteria_hash"] != old_hash}
        self.assertAlmostEqual(new["r1"]["score"], 0.1)

    def test_scoring_never_touches_records_or_history(self):
        before = self.store_snapshot()
        self.score(MIN_TABLE)
        self.assertEqual(self.store_snapshot(), before)


class FeatureOffTest(RerankScreenCase):
    def test_unset_url_exits_zero_and_writes_nothing(self):
        os.environ.pop("RERANK_URL", None)
        with mock.patch.object(rerank_screen.rerank_client, "resolve_url", lambda: None):
            code, _, err = helpers.run_cli(rerank_screen, ["score", "--project", self.pdir])
        self.assertEqual(code, 0)
        self.assertIn("OFF", err)
        self.assertIsNone(self.rows())

    def test_unreachable_server_exits_zero_and_writes_nothing(self):
        def boom(*a, **kw):
            raise rerank_client.RerankUnavailable("connection refused")

        with mock.patch.object(rerank_screen.rerank_client, "rerank", boom):
            code, _, err = helpers.run_cli(rerank_screen, ["score", "--project", self.pdir])
        self.assertEqual(code, 0)
        self.assertIn("connection refused", err)
        self.assertIsNone(self.rows())


if __name__ == "__main__":
    unittest.main()
