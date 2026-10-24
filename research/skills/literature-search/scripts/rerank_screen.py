#!/usr/bin/env python3
"""Score unscreened records against the project's criteria with a local reranker.

Prioritisation only: this script NEVER writes a verdict, a state, or a history
row. It fills an additive `rerank_scores` table that `review.py next --order
relevance` reads, so the screening order can improve while every record still
gets screened by a human or the screener agent.

Off unless RERANK_URL resolves and the server answers: no URL or no server
prints a stderr notice and exits 0, leaving the store untouched.

Usage:
  rerank_screen.py score --project <slug|dir> [--criteria criteria.json]
                         [--mode min|joint] [--limit N] [--force]
"""
import argparse
import json
import os
import sqlite3
import sys
import time

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
import rerank_client  # noqa: E402
import review  # noqa: E402

SCHEMA = """
CREATE TABLE IF NOT EXISTS rerank_scores (
  record_id TEXT NOT NULL,
  criteria_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL,
  score REAL NOT NULL,
  per_criterion TEXT,
  truncated INTEGER NOT NULL DEFAULT 0,
  scored_at TEXT NOT NULL,
  PRIMARY KEY (record_id, criteria_hash)
);
"""

CANDIDATES = ("SELECT id, title, abstract FROM records"
              " WHERE state = 'identified' AND ta_verdict IS NULL ORDER BY rowid")


def scored_ids(con, digest):
    """Records already scored under this criteria hash (empty when never scored)."""
    try:
        return {r[0] for r in con.execute(
            "SELECT record_id FROM rerank_scores WHERE criteria_hash = ?", (digest,))}
    except sqlite3.OperationalError:
        return set()


def load_criteria(path):
    with open(path, encoding="utf-8") as fh:
        criteria = json.load(fh)
    if not criteria:
        raise ValueError(f"no criteria in {path}")
    return criteria


def doc_text(row):
    return f"{row['title']}\n{row['abstract']}"


def queries(criteria, mode):
    """Per-criterion queries for min mode, one joined query for joint mode."""
    if mode == "joint":
        return {None: " ".join(criteria.values())}
    return dict(criteria)


def score_records(url, criteria, mode, rows, budget=rerank_client.TOKEN_BUDGET):
    """{record id: (aggregate, {criterion: score} | None, truncated)} plus the model."""
    docs = [doc_text(r) for r in rows]
    per_record = {r["id"]: {} for r in rows}
    truncated = set()
    model = ""
    for name, query in queries(criteria, mode).items():
        out = rerank_client.rerank(url, query, docs, budget=budget)
        model = out.model or model
        truncated.update(out.truncated)
        for index, score in out.results:
            per_record[rows[index]["id"]][name] = score
    scored = {}
    for index, row in enumerate(rows):
        per = per_record[row["id"]]
        aggregate = min(per.values())
        scored[row["id"]] = (aggregate,
                             json.dumps(per, ensure_ascii=False) if mode == "min" else None,
                             index in truncated)
    return scored, model


def cmd_score(args):
    url = rerank_client.resolve_url()
    if not url:
        print("rerank_screen: relevance ordering OFF (no RERANK_URL)", file=sys.stderr)
        return 0
    criteria = load_criteria(args.criteria or os.path.join(
        review.project_dir(args.project), "criteria.json"))
    digest = rerank_client.criteria_hash(criteria, args.mode)

    con = review.connect(review.project_dir(args.project))
    try:
        rows = list(con.execute(CANDIDATES))
        skipped = [r for r in rows if not (r["abstract"] or "").strip()]
        rows = [r for r in rows if (r["abstract"] or "").strip()]
        if not args.force:
            # The table is created only once scores exist, so a failed run leaves
            # the store exactly as it found it.
            done = scored_ids(con, digest)
            rows = [r for r in rows if r["id"] not in done]
        if args.limit:
            rows = rows[:args.limit]

        started = time.monotonic()
        try:
            scored, model = score_records(url, criteria, args.mode, rows) if rows else ({}, "")
        except rerank_client.RerankError as err:
            print(f"rerank_screen: relevance ordering unavailable: {err}", file=sys.stderr)
            return 0
        con.executescript(SCHEMA)
        at = review.now()
        con.executemany(
            "INSERT OR REPLACE INTO rerank_scores (record_id, criteria_hash, model, mode,"
            " score, per_criterion, truncated, scored_at) VALUES (?,?,?,?,?,?,?,?)",
            [(rid, digest, model, args.mode, aggregate, per, int(cut), at)
             for rid, (aggregate, per, cut) in scored.items()])
        con.commit()
        print(json.dumps({"scored": len(scored), "skipped_no_abstract": len(skipped),
                          "truncated": sum(1 for v in scored.values() if v[2]),
                          "model": model, "mode": args.mode,
                          "criteria_hash": digest,
                          "seconds": round(time.monotonic() - started, 1)}))
    finally:
        con.close()
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Local reranker relevance scores (experimental)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("score", help="score unscreened records against criteria.json")
    p.add_argument("--project", help="project slug or directory")
    p.add_argument("--criteria", help="criteria.json path (default: <project>/criteria.json)")
    p.add_argument("--mode", choices=["min", "joint"], default="min")
    p.add_argument("--limit", type=int)
    p.add_argument("--force", action="store_true", help="rescore records that already have a score")
    p.set_defaults(func=cmd_score)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
