"""rerank_eval: recall@k, WSS@95 and the refusal to report on thin gold.

Pure arithmetic over a hand-computable fixture; no network, no real project.
"""
import json
import os
import unittest

import helpers
import rerank_client
import rerank_eval
import rerank_screen
import review

CRITERIA = {"Concept": "multi-agent LLM systems"}
# 10 labelled records; relevant ones sit at import positions 1, 2, 9, 10.
RELEVANT = {"r1", "r2", "r9", "r10"}


class EvalCase(helpers.ResearchCase):
    def setUp(self):
        super().setUp()
        self.con = review.connect(self.dir)
        self.addCleanup(self.con.close)
        with open(os.path.join(self.dir, "criteria.json"), "w", encoding="utf-8") as fh:
            json.dump(CRITERIA, fh)

    def seed(self, n=10, verdicts=True):
        ts = review.now()
        for i in range(1, n + 1):
            rid = f"r{i}"
            verdict = None
            if verdicts:
                verdict = "include" if rid in RELEVANT else "exclude"
            self.con.execute(
                "INSERT INTO records (id, import_key, source_db, title, doi, ta_verdict,"
                " state, created_at, updated_at) VALUES (?,?,?,?,?,?,'identified',?,?)",
                (rid, rid, "seed", f"Title {i}", f"10.1/{rid}", verdict, ts, ts))
        self.con.commit()

    def seed_scores(self, scores, mode="min"):
        digest = rerank_client.criteria_hash(CRITERIA, mode)
        self.con.executescript(rerank_screen.SCHEMA)
        self.con.executemany(
            "INSERT OR REPLACE INTO rerank_scores (record_id, criteria_hash, model, mode,"
            " score, per_criterion, truncated, scored_at) VALUES (?,?,'m',?,?,NULL,0,?)",
            [(rid, digest, mode, score, review.now()) for rid, score in scores.items()])
        self.con.commit()

    def run_eval(self, argv=()):
        code, out, err = helpers.run_cli(
            rerank_eval, ["--project", self.dir, "--json"] + list(argv))
        return code, (json.loads(out) if out.strip() else None), err


class MetricsTest(EvalCase):
    def test_import_order_metrics_are_the_hand_computed_values(self):
        self.seed()
        code, report, _ = self.run_eval()
        self.assertEqual(code, 0)
        row = report["orderings"]["rowid"]
        self.assertEqual(report["n"], 10)
        self.assertEqual(report["relevant"], 4)
        # Relevant at 1, 2, 9, 10: 1 of 4 in the first record, 2 of 4 in the first two
        # and in the first five.
        self.assertAlmostEqual(row["recall@10%"], 0.25)
        self.assertAlmostEqual(row["recall@20%"], 0.5)
        self.assertAlmostEqual(row["recall@50%"], 0.5)
        # 95% recall of 4 relevant needs all 4, i.e. the whole list: no work saved.
        self.assertAlmostEqual(row["wss@95"], -0.05)
        self.assertEqual(row["last_relevant_rank"], 10)

    def test_relevance_order_beats_import_order_on_the_same_gold(self):
        self.seed()
        self.seed_scores({rid: (0.9 if rid in RELEVANT else 0.1)
                          for rid in [f"r{i}" for i in range(1, 11)]})
        _, report, _ = self.run_eval()
        row = report["orderings"]["min"]
        self.assertAlmostEqual(row["recall@10%"], 0.25)
        self.assertAlmostEqual(row["recall@50%"], 1.0)
        self.assertAlmostEqual(row["wss@95"], 0.55)
        self.assertEqual(row["last_relevant_rank"], 4)

    def test_unscored_orderings_are_not_reported(self):
        self.seed()
        _, report, _ = self.run_eval()
        self.assertEqual(list(report["orderings"]), ["rowid"])

    def test_text_report_lists_every_ordering(self):
        self.seed()
        self.seed_scores({"r1": 0.9}, mode="joint")
        code, out, _ = helpers.run_cli(rerank_eval, ["--project", self.dir])
        self.assertEqual(code, 0)
        self.assertIn("rowid", out)
        self.assertIn("joint", out)
        self.assertIn("wss@95", out)


class GoldTest(EvalCase):
    def test_maybe_counts_as_relevant(self):
        self.seed()
        self.con.execute("UPDATE records SET ta_verdict = 'maybe' WHERE id = 'r5'")
        self.con.commit()
        _, report, _ = self.run_eval()
        self.assertEqual(report["relevant"], 5)

    def test_labels_csv_overrides_the_store_and_matches_on_doi(self):
        self.seed(verdicts=False)
        path = os.path.join(self.dir, "labels.csv")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("id_or_doi,label\n")
            for i in range(1, 11):
                fh.write(f"10.1/r{i},{'include' if i <= 3 else 'exclude'}\n")
        _, report, err = self.run_eval(["--labels", path])
        self.assertEqual(report["n"], 10)
        self.assertEqual(report["relevant"], 3)
        self.assertAlmostEqual(report["orderings"]["rowid"]["recall@50%"], 1.0)
        self.assertNotIn("matched no record", err)  # the header row is not a bad label

    def test_refuses_to_report_on_fewer_than_three_relevant(self):
        self.seed()
        self.con.execute("UPDATE records SET ta_verdict = 'exclude' WHERE id IN ('r9','r10')")
        self.con.commit()
        code, report, err = self.run_eval()
        self.assertEqual(code, 1)
        self.assertIsNone(report)
        self.assertIn("not enough labels", err)

    def test_refuses_when_nothing_is_labelled(self):
        self.seed(verdicts=False)
        code, _, err = self.run_eval()
        self.assertEqual(code, 1)
        self.assertIn("not enough labels", err)


if __name__ == "__main__":
    unittest.main()
