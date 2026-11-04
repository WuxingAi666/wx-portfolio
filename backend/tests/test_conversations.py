import asyncio
import json
import socket
import sqlite3
import tempfile
import threading
import time
import unittest
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
import uvicorn
from app.api import create_app
from app.conversations import ConversationStore
from app.schemas import QuestionRequest
from test_boundaries import ReadyService, settings_at

ADMIN = {'Authorization': 'Bearer test-admin-token', 'X-Admin-Request': '1'}
MUTATION = {'X-Admin-Request': '1'}


def wait_ready(client):
    for _ in range(150):
        if client.get('/health/ready').status_code == 200:
            return
        time.sleep(.01)
    raise AssertionError('Service did not become ready')


class PartialFailure(ReadyService):
    async def events(self, payload, rid):
        yield {'event': 'sources', 'data': {'sources': [{'id': 'S1', 'title': '公开来源', 'excerpt': '原文'}]}}
        yield {'event': 'token', 'data': {'text': '已生成的部分内容'}}
        raise RuntimeError('upstream-secret-canary')


class SlowService(ReadyService):
    async def events(self, payload, rid):
        yield {'event': 'sources', 'data': {'sources': []}}
        for _ in range(100):
            yield {'event': 'token', 'data': {'text': '分段内容'}}
            await asyncio.sleep(.05)
        yield {'event': 'done', 'data': {'grounded': False, 'tokens': 10}}


class ConversationTests(unittest.TestCase):
    def test_session_private_records_optout_export_delete_and_ownership(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), ReadyService)
            with TestClient(app) as client:
                wait_ready(client)
                self.assertEqual(client.get('/admin/').status_code, 200)
                self.assertIn("frame-ancestors 'none'", client.get('/admin/').headers['content-security-policy'])
                self.assertEqual(client.get('/api/v1/admin/conversations').status_code, 401)
                self.assertEqual(client.post('/api/v1/admin/session', json={'token': 'test-admin-token'}).status_code, 403)
                self.assertEqual(client.post('/api/v1/admin/session', headers=MUTATION, json={'token': '中文错误口令'}).status_code, 401)
                login = client.post('/api/v1/admin/session', headers=MUTATION, json={'token': 'test-admin-token'})
                self.assertEqual(login.status_code, 200)
                self.assertIn('HttpOnly', login.headers['set-cookie'])
                self.assertIn('SameSite=strict', login.headers['set-cookie'])
                visitor, cid = str(uuid4()), str(uuid4())
                payload = {'question': '<img src=x onerror=alert(1)> 项目介绍？', 'visitor_id': visitor, 'conversation_id': cid,
                           'history': [{'role': 'user', 'content': 'history-only-not-to-be-imported'}]}
                self.assertEqual(client.post('/api/v1/qa', json=payload).status_code, 200)
                payload['question'] = '技术难点是什么？'
                stream = client.post('/api/v1/chat/stream', json=payload)
                self.assertIn('event: done', stream.text)
                self.assertNotIn('event: recording', stream.text)
                self.assertEqual(client.post('/api/v1/qa', json={**payload, 'record_conversation': False, 'question': '不应保存'}).status_code, 200)
                self.assertEqual(client.post('/api/v1/qa', json={**payload, 'visitor_id': str(uuid4())}).status_code, 409)
                listing = client.get('/api/v1/admin/conversations').json()
                self.assertEqual(listing['total'], 1)
                self.assertEqual(listing['items'][0]['turn_count'], 2)
                detail = client.get('/api/v1/admin/conversations/' + cid).json()
                self.assertEqual([t['status'] for t in detail['turns']], ['ok', 'ok'])
                self.assertIn('<img', detail['turns'][0]['question'])
                self.assertNotIn('history-only-not-to-be-imported', json.dumps(detail))
                self.assertNotIn(visitor, json.dumps(detail))
                exported = client.get('/api/v1/admin/conversations/' + cid + '?export=true')
                self.assertIn('attachment;', exported.headers['content-disposition'])
                self.assertEqual(exported.json(), detail)
                self.assertEqual(client.delete('/api/v1/admin/conversations/' + cid).status_code, 403)
                self.assertEqual(client.delete('/api/v1/admin/conversations/' + cid, headers={**MUTATION, 'Origin': 'https://evil.example'}).status_code, 403)
                self.assertEqual(client.delete('/api/v1/admin/conversations/' + cid, headers=MUTATION).status_code, 200)
                self.assertEqual(client.get('/api/v1/admin/conversations/' + cid).status_code, 404)
                self.assertGreater(sum(r['count'] for r in client.get('/api/v1/admin/stats').json()['requests']), 0)
                self.assertEqual(client.delete('/api/v1/admin/session', headers=MUTATION).status_code, 200)
                self.assertEqual(client.get('/api/v1/admin/conversations').status_code, 401)

    def test_partial_failure_is_saved_without_upstream_error_text(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), PartialFailure)
            with TestClient(app) as client:
                wait_ready(client)
                cid = str(uuid4())
                result = client.post('/api/v1/chat/stream', json={'question': '故障测试', 'conversation_id': cid})
                self.assertIn('event: error', result.text)
                self.assertNotIn('upstream-secret-canary', result.text)
                detail = app.state.conversations.detail(cid)
                self.assertEqual(detail['turns'][0]['status'], 'error')
                self.assertEqual(detail['turns'][0]['answer'], '已生成的部分内容')
                self.assertEqual(len(detail['turns'][0]['sources']), 1)
                self.assertNotIn('upstream-secret-canary', json.dumps(detail))

    def test_retention_recovery_literal_search_pagination_and_active_deletion(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversationStore(settings_at(root))
            visitor, cid = uuid4(), uuid4()
            old_rid = str(uuid4())
            store.begin(old_rid, QuestionRequest(question='旧记录', visitor_id=visitor, conversation_id=cid))
            store.save(old_rid, '旧内容', [], 'ok')
            with store.connect() as db:
                db.execute('UPDATE turns SET created=? WHERE id=?', (time.time()-31*86400, old_rid))
            for i in range(23):
                rid = str(uuid4())
                store.begin(rid, QuestionRequest(question='100%_原文' if i == 0 else '普通问题', visitor_id=visitor,
                                                 conversation_id=cid if i == 0 else uuid4()))
                store.save(rid, '回答', [], 'ok')
            interrupted = str(uuid4())
            store.begin(interrupted, QuestionRequest(question='中断问题', visitor_id=visitor, conversation_id=cid))
            store.save(interrupted, '重启前的部分回答', [], 'active')
            self.assertEqual(store.delete(str(cid)), 'active')
            store.recover_interrupted()
            store.cleanup()
            detail = store.detail(str(cid))
            self.assertEqual(len(detail['turns']), 2)
            self.assertEqual(detail['turns'][-1]['status'], 'interrupted')
            self.assertEqual(detail['turns'][-1]['answer'], '重启前的部分回答')
            self.assertEqual(store.list(search='%_')['total'], 1)
            self.assertEqual(store.list(search="' OR 1=1 --")['total'], 0)
            self.assertEqual(len(store.list(page=2)['items']), 3)
            self.assertEqual(ConversationStore(settings_at(root)).overview()['conversations'], 23)

    def test_recording_failure_does_not_block_answer_and_releases_quota(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), ReadyService)
            with TestClient(app) as client:
                wait_ready(client)
                original = app.state.conversations.begin
                def fail(*args):
                    raise sqlite3.OperationalError('private-path-secret')
                app.state.conversations.begin = fail
                response = client.post('/api/v1/qa', json={'question': '记录故障'})
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()['recording_saved'])
                self.assertNotIn('private-path-secret', response.text)
                self.assertTrue(app.state.recording_error)
                self.assertEqual(app.state.recording_failures, 1)
                self.assertEqual(client.post('/api/v1/qa', json={'question': '暂停记录后提问', 'record_conversation': False}).status_code, 200)
                app.state.conversations.begin = original
                app.state.conversations.save = fail
                response = client.post('/api/v1/chat/stream', json={'question': '完成时写入故障'})
                self.assertIn('event: done', response.text)
                self.assertNotIn('event: recording', response.text)
                self.assertNotIn('private-path-secret', response.text)
                self.assertTrue(app.state.recording_error)
                with app.state.guard.connect() as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM requests WHERE status='active'").fetchone()[0], 0)

    def test_login_throttle_remote_http_rejection_and_disabled_recording(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root, conversation_recording=False), ReadyService)
            with TestClient(app) as client:
                wait_ready(client)
                self.assertFalse(client.get('/api/v1/chat/config').json()['recording_enabled'])
                self.assertEqual(client.post('/api/v1/qa', json={'question': '全局不记录'}).status_code, 200)
                self.assertEqual(app.state.conversations.overview()['turns'], 0)
                for _ in range(5):
                    self.assertEqual(client.post('/api/v1/admin/session', headers=MUTATION, json={'token': 'bad'}).status_code, 401)
                self.assertEqual(client.post('/api/v1/admin/session', headers=MUTATION, json={'token': 'test-admin-token'}).status_code, 429)
            with TestClient(app, client=('198.51.100.7', 1234)) as remote:
                self.assertEqual(remote.get('/api/v1/admin/conversations', headers=ADMIN).status_code, 403)

    def test_real_client_disconnect_preserves_partial_answer_and_releases_slot(self):
        # TestClient buffers streams; use an actual ASGI socket for disconnect.
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), SlowService)
            sock = socket.socket()
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
            server = uvicorn.Server(uvicorn.Config(app, log_level='error', access_log=False))
            worker = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True)
            worker.start()
            try:
                with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=5) as client:
                    for _ in range(200):
                        if server.started: break
                        time.sleep(.01)
                    wait_ready(client)
                    cid = str(uuid4())
                    with client.stream('POST', '/api/v1/chat/stream', json={'question': '主动停止', 'conversation_id': cid}) as response:
                        for line in response.iter_lines():
                            if line.startswith('event: token'):
                                partial = app.state.conversations.detail(cid)['turns'][0]
                                self.assertEqual(partial['status'], 'active')
                                self.assertIn('分段内容', partial['answer'])
                                break
                    # Recording and quota use separate transactions. A reader may
                    # observe the first commit before the second one completes.
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        detail = app.state.conversations.detail(cid)
                        with app.state.guard.connect() as db:
                            active = db.execute("SELECT COUNT(*) FROM requests WHERE status='active'").fetchone()[0]
                        if detail['turns'][0]['status'] != 'active' and active == 0:
                            break
                        time.sleep(.01)
                    self.assertEqual(detail['turns'][0]['status'], 'cancelled')
                    self.assertIn('分段内容', detail['turns'][0]['answer'])
                    with app.state.guard.connect() as db:
                        self.assertEqual(db.execute("SELECT COUNT(*) FROM requests WHERE status='active'").fetchone()[0], 0)
            finally:
                server.should_exit = True
                worker.join(timeout=8)
                self.assertFalse(worker.is_alive(), 'Test server did not stop')

    def test_https_session_requires_secure_cookie_and_same_origin(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), ReadyService)
            with TestClient(app, base_url='https://testserver', client=('198.51.100.8', 4321)) as client:
                wait_ready(client)
                bad = client.post('/api/v1/admin/session', headers={**MUTATION, 'Origin': 'http://8.152.192.126'}, json={'token': 'test-admin-token'})
                self.assertEqual(bad.status_code, 403)
                response = client.post('/api/v1/admin/session', headers={**MUTATION, 'Origin': 'https://testserver'}, json={'token': 'test-admin-token'})
                self.assertEqual(response.status_code, 200)
                self.assertIn('Secure', response.headers['set-cookie'])
                self.assertEqual(client.get('/api/v1/admin/conversations').status_code, 200)
                self.assertEqual(client.get('/api/v1/admin/conversations?status=made-up').status_code, 422)
                self.assertEqual(client.get('/api/v1/admin/conversations?page_size=10000').status_code, 422)
