#!/usr/bin/env python3
"""Does relevance ordering actually save screening work? Measure it.

Compares import order against the stored reranker orderings on the project's
own gold labels (title/abstract verdicts, or an external labels CSV), and
reports recall at 10/20/50% of the list, WSS@95 and the rank of the last
relevant record. Read-only: this script never writes to review.db.

Usage:
  rerank_eval.py --project <slug|dir> [--labels labels.csv] [--json]

labels.csv: `id_or_doi,label` rows (header optional); include/maybe/relevant/1
count as relevant, everything else as not.
"""
import argparse
import csv
import json
import math
import os
import sqlite3
import sys

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
import rerank_client  # noqa: E402
import review  # noqa: E402

RELEVANT_LABELS = frozenset({"include", "included", "maybe", "relevant", "yes", "1", "true"})
MIN_RELEVANT = 3
CUTOFFS = (0.1, 0.2, 0.5)


def gold_from_store(con):
    """{record id: relevant} from title/abstract verdicts (maybe counts as relevant)."""
    return {row["id"]: row["ta_verdict"] in ("include", "maybe")
            for row in con.execute(
                "SELECT id, ta_verdict FROM records WHERE ta_verdict IS NOT NULL")}


def gold_from_csv(con, path):
    """Same, from an external `id_or_doi,label` export (Covidence and friends)."""
    by_key = {}
    for row in con.execute("SELECT id, doi FROM records"):
        by_key[row["id"]] = row["id"]
        if row["doi"]:
            by_key[row["doi"].strip().lower()] = row["id"]
    gold, unknown = {}, 0
    with open(path, newline="", encoding="utf-8") as fh:
        for fields in csv.reader(fh):
            if len(fields) < 2:
                continue
            key, label = fields[0].strip(), fields[1].strip().lower()
            rec_id = by_key.get(key) or by_key.get(key.lower())
            if rec_id is None:
                unknown += 1
                continue
            gold[rec_id] = label in RELEVANT_LABELS
    if unknown:
        print(f"rerank_eval: {unknown} label row(s) matched no record", file=sys.stderr)
    return gold


def orderings(con, pdir, ids):
    """{name: [record id, ...]} for import order plus every scored rerank mode."""
    rowid_order = [row["id"] for row in con.execute("SELECT id FROM records ORDER BY rowid")
                   if row["id"] in ids]
    out = {"rowid": rowid_order}
    try:
        with open(os.path.join(pdir, "criteria.json"), encoding="utf-8") as fh:
            criteria = json.load(fh)
    except (OSError, ValueError):
        return out
    rank = {rid: i for i, rid in enumerate(rowid_order)}
    for mode in ("min", "joint"):
        digest = rerank_client.criteria_hash(criteria, mode)
        try:
            scores = {r["record_id"]: r["score"] for r in con.execute(
                "SELECT record_id, score FROM rerank_scores WHERE criteria_hash = ?", (digest,))
                if r["record_id"] in ids}
        except sqlite3.OperationalError:
            return out
        if scores:
            # Unscored records keep import order behind the scored ones.
            out[mode] = sorted(rowid_order,
                               key=lambda rid: (rid not in scores, -scores.get(rid, 0.0),
                                                rank[rid]))
    return out


def metrics(order, gold):
    """recall at each cutoff, WSS@95 and the rank of the last relevant record."""
    flags = [gold[rid] for rid in order]
    n, relevant = len(flags), sum(flags)
    out = {f"recall@{int(p * 100)}%": sum(flags[:math.ceil(p * n)]) / relevant
           for p in CUTOFFS}
    needed = math.ceil(0.95 * relevant)
    found = screened = 0
    for i, flag in enumerate(flags, start=1):
        found += flag
        if found >= needed:
            screened = i
            break
    # Work saved over screening a random sample that reaches the same recall.
    out["wss@95"] = (n - screened) / n - 0.05
    out["last_relevant_rank"] = max(i for i, flag in enumerate(flags, start=1) if flag)
    return out


def render(report):
    cols = [f"recall@{int(p * 100)}%" for p in CUTOFFS] + ["wss@95", "last_relevant_rank"]
    lines = [f"gold: {report['relevant']} relevant of {report['n']} labelled"
             f" ({report['gold_source']})",
             "ordering  " + "  ".join(f"{c:>18}" for c in cols)]
    for name, row in report["orderings"].items():
        values = [f"{row[c]:18.3f}" if isinstance(row[c], float) else f"{row[c]:>18}"
                  for c in cols]
        lines.append(f"{name:<10}" + "  ".join(values))
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Evaluate relevance ordering (experimental)")
    ap.add_argument("--project", help="project slug or directory")
    ap.add_argument("--labels", help="external gold labels CSV (id_or_doi,label)")
    ap.add_argument("--json", action="store_true", help="machine-readable report")
    args = ap.parse_args(argv)

    pdir = review.project_dir(args.project)
    con = review.connect(pdir)
    try:
        gold = gold_from_csv(con, args.labels) if args.labels else gold_from_store(con)
        relevant = sum(gold.values())
        if relevant < MIN_RELEVANT:
            print(f"rerank_eval: not enough labels to evaluate ({relevant} relevant,"
                  f" need {MIN_RELEVANT}) - screen more records or pass --labels",
                  file=sys.stderr)
            return 1
        report = {"n": len(gold), "relevant": relevant,
                  "gold_source": args.labels or "ta_verdict",
                  "orderings": {name: metrics(order, gold)
                                for name, order in orderings(con, pdir, set(gold)).items()}}
    finally:
        con.close()
    print(json.dumps(report, ensure_ascii=False) if args.json else render(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
