"""rerank_client: URL resolution, loopback guard, batching, error mapping.

Fully offline: urllib.request.urlopen is replaced per test. helpers installs a
real-network guard, so an unmocked call fails loudly instead of dialing out.
"""
import io
import json
import os
import unittest
import urllib.error
from unittest import mock

import helpers
import rerank_client


def fake_server(score_of, seen=None, model="qwen3-reranker"):
    """urlopen stub: scores each document with score_of(document text)."""

    def urlopen(req, timeout=None):
        body = json.loads(req.data.decode())
        if seen is not None:
            seen.append(body)
        results = [{"index": i, "relevance_score": score_of(d)}
                   for i, d in enumerate(body["documents"])]
        return io.BytesIO(json.dumps(
            {"model": model, "results": results,
             "usage": {"prompt_tokens": 10 * len(results)}}).encode())

    return urlopen


class ResolveUrlTest(helpers.ResearchCase):
    def test_env_wins_over_config(self):
        path = os.path.join(self.dir, "config.env")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write('RERANK_URL="http://127.0.0.1:9000"\n')
        with mock.patch.dict(os.environ, {"RERANK_URL": "http://127.0.0.1:8091"}):
            self.assertEqual(rerank_client.resolve_url(path), "http://127.0.0.1:8091")

    def test_falls_back_to_config_env_file(self):
        path = os.path.join(self.dir, "config.env")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write('# comment\nOTHER=1\nRERANK_URL="http://127.0.0.1:9000"\n')
        env = {k: v for k, v in os.environ.items() if k != "RERANK_URL"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(rerank_client.resolve_url(path), "http://127.0.0.1:9000")

    def test_none_when_absent_means_feature_off(self):
        env = {k: v for k, v in os.environ.items() if k != "RERANK_URL"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertIsNone(rerank_client.resolve_url(os.path.join(self.dir, "nope.env")))


class LoopbackGuardTest(helpers.ResearchCase):
    def test_remote_host_refused_by_default(self):
        env = {k: v for k, v in os.environ.items() if k != "RERANK_ALLOW_REMOTE"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(rerank_client.RerankError) as ctx:
                rerank_client.rerank("http://evil.example.com:8091", "q", ["d"])
        self.assertIn("RERANK_ALLOW_REMOTE", str(ctx.exception))

    def test_remote_host_allowed_with_opt_in(self):
        with mock.patch.dict(os.environ, {"RERANK_ALLOW_REMOTE": "1"}), \
                mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                                  fake_server(lambda d: 0.5)):
            out = rerank_client.rerank("http://10.0.0.5:8091", "q", ["d"])
        self.assertEqual(out.results, [(0, 0.5)])

    def test_localhost_and_ipv6_loopback_accepted(self):
        with mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                               fake_server(lambda d: 0.5)):
            for url in ("http://localhost:8091", "http://[::1]:8091"):
                self.assertEqual(rerank_client.rerank(url, "q", ["d"]).results, [(0, 0.5)])


class BatchingTest(helpers.ResearchCase):
    def test_splits_by_token_budget_and_remaps_indices_globally(self):
        # 5 docs x ~100 estimated tokens, room for 2 per batch -> 3 requests.
        docs = [f"{i}" + "x" * 399 for i in range(5)]
        seen = []
        with mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                               fake_server(lambda d: int(d[0]) / 10, seen)):
            out = rerank_client.rerank("http://127.0.0.1:8091", "q", docs, budget=220)
        self.assertEqual([len(b["documents"]) for b in seen], [2, 2, 1])
        # Scores are 0.0..0.4 by document; indices must be global, sorted desc.
        self.assertEqual(out.results, [(4, 0.4), (3, 0.3), (2, 0.2), (1, 0.1), (0, 0.0)])
        self.assertEqual(out.model, "qwen3-reranker")
        self.assertEqual(out.truncated, [])

    def test_top_n_applies_across_batches(self):
        docs = [f"{i}" + "x" * 399 for i in range(5)]
        with mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                               fake_server(lambda d: int(d[0]) / 10)):
            out = rerank_client.rerank("http://127.0.0.1:8091", "q", docs,
                                       top_n=2, budget=220)
        self.assertEqual(out.results, [(4, 0.4), (3, 0.3)])

    def test_oversize_document_is_truncated_and_flagged(self):
        docs = ["short", "y" * 4000]
        seen = []
        with mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                               fake_server(lambda d: 0.5, seen)), helpers.captured() as (_, err):
            out = rerank_client.rerank("http://127.0.0.1:8091", "q", docs, budget=220)
        sent = [d for body in seen for d in body["documents"]]
        self.assertEqual(out.truncated, [1])
        self.assertLess(len(sent[1]), 4000)
        self.assertIn("truncated", err.getvalue())

    def test_empty_documents_make_no_request(self):
        with mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                               fake_server(lambda d: 0.5)) as _:
            out = rerank_client.rerank("http://127.0.0.1:8091", "q", [])
        self.assertEqual(out.results, [])


class ErrorMappingTest(helpers.ResearchCase):
    def test_server_down_raises_rerank_unavailable(self):
        def down(req, timeout=None):
            raise urllib.error.URLError("connection refused")

        with mock.patch.object(rerank_client._http.urllib.request, "urlopen", down), \
                mock.patch.object(rerank_client._http.time, "sleep"), helpers.captured():
            with self.assertRaises(rerank_client.RerankUnavailable):
                rerank_client.rerank("http://127.0.0.1:8091", "q", ["d"])

    def test_malformed_body_raises_protocol_error(self):
        def junk(req, timeout=None):
            return io.BytesIO(b'{"object": "list"}')

        with mock.patch.object(rerank_client._http.urllib.request, "urlopen", junk):
            with self.assertRaises(rerank_client.RerankProtocolError):
                rerank_client.rerank("http://127.0.0.1:8091", "q", ["d"])

    def test_non_json_body_raises_protocol_error(self):
        def junk(req, timeout=None):
            return io.BytesIO(b"<html>502</html>")

        with mock.patch.object(rerank_client._http.urllib.request, "urlopen", junk):
            with self.assertRaises(rerank_client.RerankProtocolError):
                rerank_client.rerank("http://127.0.0.1:8091", "q", ["d"])

    def test_health_is_false_when_server_is_down(self):
        def down(req, timeout=None):
            raise urllib.error.URLError("connection refused")

        with mock.patch.object(rerank_client._http.urllib.request, "urlopen", down), \
                mock.patch.object(rerank_client._http.time, "sleep"), helpers.captured():
            self.assertFalse(rerank_client.health("http://127.0.0.1:8091"))

    def test_health_is_true_when_server_reports_ok(self):
        with mock.patch.object(rerank_client._http.urllib.request, "urlopen",
                               lambda req, timeout=None: io.BytesIO(b'{"status":"ok"}')):
            self.assertTrue(rerank_client.health("http://127.0.0.1:8091"))


if __name__ == "__main__":
    unittest.main()
