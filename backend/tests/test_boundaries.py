import asyncio
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient
from langchain_core.embeddings import Embeddings

from app.api import create_app
from app.config import Settings
from app.guard import AdmissionError, RequestGuard
from app.index import KnowledgeIndex


class VectorFixture(Embeddings):
    """Deterministic test vectors only. Never used by the application."""
    def embed_documents(self, texts):
        return [[2., 0., 0.] for _ in texts]

    def embed_query(self, text):
        return [4., 0., 0.]


def settings_at(path, **extra):
    return Settings(
        _env_file=None, deepseek_api_key="unit-test-only",
        embedding_provider="local_bge", storage_dir=Path(path),
        admin_token="test-admin-token", **extra,
    )


class ReadyService:
    def __init__(self, settings):
        self.ready = False
        self.index = type("Index", (), {"chunk_count": 1})()

    def initialize(self):
        self.ready = True

    async def events(self, payload, request_id):
        yield {"event": "sources", "data": {"sources": []}}
        yield {"event": "token", "data": {"text": "本地边界测试回答"}}
        yield {"event": "done", "data": {"grounded": False, "elapsed_ms": 1, "tokens": 3}}


class BrokenService(ReadyService):
    async def events(self, payload, request_id):
        yield {"event": "sources", "data": {"sources": []}}
        raise RuntimeError("simulated upstream secret/path: must never reach the visitor")


class BoundaryTests(unittest.TestCase):
    def test_stream_failure_is_sanitized_and_releases_admission(self):
        with tempfile.TemporaryDirectory() as root:
            with TestClient(create_app(settings_at(root), BrokenService)) as client:
                import time
                for _ in range(100):
                    if client.get("/health/ready").status_code == 200:
                        break
                    time.sleep(.01)
                response = client.post("/api/v1/chat/stream", json={"question": "hello"})
                self.assertIn("event: error", response.text)
                self.assertNotIn("event: done", response.text)
                self.assertNotIn("simulated upstream", response.text)
                stats = client.get("/api/v1/admin/stats", headers={"Authorization":"Bearer test-admin-token"}).json()
                self.assertEqual(stats["requests"][0]["status"], "error")

    def test_concurrent_admission_does_not_oversubscribe(self):
        with tempfile.TemporaryDirectory() as root:
            guard = RequestGuard(settings_at(root, max_concurrent=2, requests_per_minute=50))
            def attempt(number):
                try:
                    guard.reserve(str(number), "visitor-" + str(number))
                    return True
                except AdmissionError:
                    return False
            with ThreadPoolExecutor(max_workers=8) as pool:
                accepted = list(pool.map(attempt, range(8)))
            self.assertEqual(sum(accepted), 2)

    def test_quotas_are_persistent_and_atomic(self):
        with tempfile.TemporaryDirectory() as root:
            s = settings_at(root, requests_per_day=2, max_concurrent=1)
            guard = RequestGuard(s)
            guard.reserve("1", "127.0.0.1")
            with self.assertRaises(AdmissionError):
                guard.reserve("2", "127.0.0.2")
            guard.finish("1", "ok")
            RequestGuard(s).reserve("2", "127.0.0.2")
            guard.finish("2", "ok")
            with self.assertRaises(AdmissionError):
                RequestGuard(s).reserve("3", "127.0.0.3")
            self.assertEqual(sum(row["count"] for row in guard.stats()["requests"]), 2)

    def test_normalized_faiss_persistence_and_integrity(self):
        with tempfile.TemporaryDirectory() as root:
            data = Path(root) / "data"
            data.mkdir()
            (data / "one.txt").write_text("公开项目资料。" * 30, encoding="utf-8")
            (data / "manifest.json").write_text(json.dumps([
                {"id": "one", "file": "one.txt", "title": "公开资料", "anchor": "proj"}
            ]), encoding="utf-8")
            s = settings_at(Path(root) / "storage", data_dir=data, chunk_size=120, chunk_overlap=20)
            first = KnowledgeIndex(s, VectorFixture())
            first.initialize()
            self.assertGreater(first.chunk_count, 1)
            for key in first.store.index_to_docstore_id.values():
                chunk = first.store.docstore.search(key)
                self.assertIn("仵星的公开资料：公开资料", chunk.page_content)
            second = KnowledgeIndex(s, VectorFixture())
            second.initialize()
            hits = asyncio.run(second.search("检索问题"))
            self.assertAlmostEqual(hits[0][1], 1.)
            self.assertNotIn("source", hits[0][0].metadata)
            self.assertFalse(list(s.storage_dir.rglob("*.pkl")))
            snapshot = s.storage_dir / "indexes" / first.fingerprint
            (snapshot / "documents.json").write_text("tampered", encoding="utf-8")
            second.initialize()
            self.assertGreater(second.chunk_count, 0)

    def test_http_contracts_cors_admin_and_payload_limits(self):
        with tempfile.TemporaryDirectory() as root:
            s = settings_at(root, max_body_bytes=1024, requests_per_minute=20)
            with TestClient(create_app(s, ReadyService)) as client:
                self.assertEqual(client.get("/health/live").status_code, 200)
                import time
                for _ in range(100):
                    if client.get("/health/ready").status_code == 200:
                        break
                    time.sleep(.01)
                self.assertEqual(client.get("/health/ready").status_code, 200)
                cors = client.options("/api/v1/qa", headers={
                    "Origin": "http://8.152.192.126",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                })
                self.assertEqual(cors.headers.get("access-control-allow-origin"), "http://8.152.192.126")
                denied = client.post("/api/v1/qa", json={"question": "hi"}, headers={"Origin": "https://evil.example"})
                self.assertEqual(denied.status_code, 403)
                self.assertEqual(client.post("/api/v1/qa", json={"question": "  "}).status_code, 422)
                self.assertEqual(client.post("/api/v1/qa", content=b"x"*2048).status_code, 413)
                self.assertEqual(client.get("/api/v1/admin/stats").status_code, 401)
                self.assertEqual(client.post("/api/v1/index/rebuild").status_code, 404)
                answer = client.post("/api/v1/qa", json={"question": "hello"})
                self.assertEqual(answer.status_code, 200)
                self.assertIn("request_id", answer.json())
                stream = client.post("/api/v1/chat/stream", json={"question": "hello"})
                self.assertEqual(stream.status_code, 200)
                self.assertIn("event: token", stream.text)
                self.assertIn("event: done", stream.text)
                self.assertEqual(client.get("/api/v1/admin/stats", headers={"Authorization":"Bearer test-admin-token"}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
