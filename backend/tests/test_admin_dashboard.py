"""Dashboard integration contracts; temporary databases and no model/API calls."""
import csv
from datetime import date, datetime, timezone
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from app.api import create_app
from app.conversations import ConversationStore
from app.schemas import QuestionRequest
from app.passwords import hash_password, verify_password
from test_boundaries import ReadyService, settings_at
from test_conversations import ADMIN, MUTATION, wait_ready


def add(store, visitor=None, cid=None, question='RAG 的检索链路是什么？', status='ok', grounded=True):
    visitor, cid, rid = visitor or uuid4(), cid or uuid4(), uuid4().hex
    store.begin(rid, QuestionRequest(question=question, visitor_id=visitor, conversation_id=cid))
    store.save(rid, '先召回资料，再根据上下文生成回答。', [], status, 12, 1200, grounded)
    return str(visitor), str(cid), rid


class DashboardTests(unittest.TestCase):
    def test_separate_password_hash_login_retains_internal_token(self):
        password = 'dashboard-fixture-password'
        encoded = hash_password(password)
        self.assertNotEqual(encoded, hash_password(password))
        self.assertTrue(verify_password(password, encoded))
        self.assertFalse(verify_password('wrong', encoded))
        self.assertFalse(verify_password(password, 'invalid-hash'))
        with tempfile.TemporaryDirectory() as root:
            with TestClient(create_app(settings_at(root, admin_password_hash=encoded), ReadyService)) as client:
                wait_ready(client)
                self.assertEqual(client.get('/kanban/').status_code, 200)
                self.assertEqual(client.get('/kanban/assets/admin.js').status_code, 200)
                rejected = client.post('/api/v1/admin/session', headers=MUTATION,
                                       json={'token': 'test-admin-token'})
                self.assertEqual(rejected.status_code, 401)
                login = client.post('/api/v1/admin/session', headers=MUTATION, json={'token': password})
                self.assertEqual(login.status_code, 200)
                self.assertTrue(client.get('/api/v1/admin/session').json()['authenticated'])
                client.cookies.clear()
                self.assertEqual(client.get('/api/v1/admin/conversations', headers=ADMIN).status_code, 200)
                self.assertEqual(client.get('/api/v1/admin/conversations', headers={'Authorization':'Bearer '+password}).status_code, 401)

    def test_v1_migration_preserves_records_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'conversations.sqlite3'
            cid, rid, visitor = str(uuid4()), uuid4().hex, 'a' * 64
            with sqlite3.connect(path) as db:
                db.executescript('''
                    CREATE TABLE conversations(id TEXT PRIMARY KEY,visitor_hash TEXT NOT NULL,created REAL NOT NULL,updated REAL NOT NULL);
                    CREATE TABLE turns(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                      question TEXT NOT NULL,answer TEXT NOT NULL DEFAULT '',sources TEXT NOT NULL DEFAULT '[]',created REAL NOT NULL,
                      finished REAL,status TEXT NOT NULL,tokens INTEGER NOT NULL DEFAULT 0,elapsed_ms INTEGER NOT NULL DEFAULT 0,
                      grounded INTEGER,notice_version TEXT NOT NULL DEFAULT 'anonymous-v1');
                    PRAGMA user_version=1;
                ''')
                db.execute('INSERT INTO conversations VALUES(?,?,?,?)', (cid, visitor, 100, 200))
                db.execute("INSERT INTO turns(id,conversation_id,question,answer,created,status) VALUES(?,?,?,?,?,'ok')", (rid, cid, '旧问题', '完整旧回答', 100))
            db.close()
            for _ in range(2):
                store = ConversationStore(settings_at(root))
                detail = store.detail(cid)
                self.assertEqual(detail['turns'][0]['answer'], '完整旧回答')
                self.assertEqual(detail['turns'][0]['id'], rid)
                self.assertEqual(detail['visitor_id'], visitor)
                self.assertEqual(store.visitors()['total'], 1)
                self.assertFalse(detail['favorite'])
                with store.connect() as db:
                    self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 2)
                    self.assertEqual(db.execute('SELECT notice_version FROM turns').fetchone()[0], 'anonymous-v1')

    def test_visitor_grouping_profiles_and_review_new_question(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversationStore(settings_at(root))
            visitor, cid, _ = add(store)
            add(store, visitor=visitor)
            add(store)
            grouped = store.visitors()
            self.assertEqual(grouped['total'], 2)
            profile = next(p for p in grouped['items'] if p['conversations'] == 2)
            self.assertEqual(profile['turns'], 2)
            self.assertNotIn(visitor, json.dumps(profile))
            store.update_profile(profile['id'], '技术面访客', '关注检索召回')
            self.assertEqual(store.list(search='技术面访客')['total'], 2)
            self.assertEqual(store.list(search='关注检索召回')['total'], 2)
            self.assertEqual(store.detail(cid)['display_name'], '技术面访客')
            store.annotate(cid, favorite=True, reviewed=True)
            self.assertFalse(store.detail(cid)['unread'])
            self.assertEqual(store.list(attention='favorite')['total'], 1)
            add(store, visitor, cid, question='这是新的追问')
            self.assertTrue(store.detail(cid)['unread'])
            self.assertEqual(len(store.detail(cid)['turns']), 2)
            # Deleting one session must not erase the profile of other sessions.
            store.delete(cid)
            self.assertEqual(store.profile(profile['id'])['conversations'], 1)

    def test_date_filters_beijing_boundary_and_consistent_metrics_export(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversationStore(settings_at(root))
            v, cid, before = add(store, question='边界前')
            _, _, after = add(store, v, cid, question='边界后', grounded=False)
            add(store, question='另外的访客')
            with store.connect() as db:
                boundary = datetime(2026, 11, 3, 16, tzinfo=timezone.utc).timestamp()
                db.execute('UPDATE turns SET created=? WHERE id=?', (boundary - .01, before))
                db.execute('UPDATE turns SET created=? WHERE id=?', (boundary, after))
            visitor = store.detail(cid)['visitor_id']
            filters = dict(date_from=date(2026, 11, 4), date_to=date(2026, 11, 4), visitor=visitor, attention='ungrounded')
            overview, listing, visitors, exported = store.overview(**filters), store.list(**filters), store.visitors(**filters), store.export_rows(**filters)
            self.assertEqual((overview['turns'], listing['total'], visitors['total'], len(exported)), (1, 1, 1, 1))
            self.assertEqual(exported[0]['question'], '边界后')
            self.assertEqual(overview['avg_elapsed_ms'], 1200)
            self.assertEqual(listing['items'][0]['turn_count'], 2)  # Details retain context outside filters.
            self.assertEqual(store.overview(visitor=visitor, date_to=date(2026, 11, 3))['turns'], 1)

    def test_revision_changes_on_partial_final_metadata_and_delete(self):
        with tempfile.TemporaryDirectory() as root:
            store = ConversationStore(settings_at(root))
            last = store.revision()
            def changed():
                nonlocal last
                revision = store.revision()
                self.assertGreater(revision, last)
                last = revision
            visitor, cid, rid = add(store, status='active')
            changed()
            store.save(rid, '部分回答', [], 'active'); changed()
            store.save(rid, '完整回答', [], 'ok'); changed()
            store.annotate(cid, reviewed=True); changed()
            store.update_profile(store.detail(cid)['visitor_id'], '关注技术', '备注'); changed()
            visitor_id = store.detail(cid)['visitor_id']
            store.delete(cid); changed()
            self.assertEqual(store.visitors()['total'], 0)
            self.assertIsNone(store.profile(visitor_id))

    def test_admin_routes_auth_filters_metadata_and_safe_exports(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), ReadyService)
            with TestClient(app) as client:
                wait_ready(client)
                for endpoint in ['changes', 'visitors', 'conversations/overview', 'conversations/export']:
                    self.assertEqual(client.get('/api/v1/admin/' + endpoint).status_code, 401)
                visitor, cid, _ = add(app.state.conversations, question='=HYPERLINK("https://example.org")')
                p = app.state.conversations.visitors()['items'][0]
                path = '/api/v1/admin/visitors/' + p['id']
                self.assertEqual(client.patch(path, headers={'Authorization': ADMIN['Authorization']}, json={'notes': '不应写入'}).status_code, 403)
                self.assertEqual(client.patch(path, headers={**ADMIN, 'Origin': 'https://evil.example'}, json={'notes': '不应写入'}).status_code, 403)
                self.assertEqual(client.patch(path, headers=ADMIN, json={'display_name': '名字' * 30}).status_code, 422)
                self.assertEqual(client.patch(path, headers=ADMIN, json={'notes': 'x' * 100000}).status_code, 413)
                response = client.patch(path, headers=ADMIN, json={'display_name': '技术访客', 'notes': '讨论向量检索'})
                self.assertEqual(response.json()['notes'], '讨论向量检索')
                self.assertEqual(client.patch('/api/v1/admin/conversations/' + cid, headers=ADMIN, json={'favorite': True}).status_code, 200)
                query = '?visitor=' + p['id'] + '&attention=favorite&search=向量检索'
                metrics = client.get('/api/v1/admin/conversations/overview' + query, headers=ADMIN).json()
                self.assertEqual(metrics['turns'], 1)
                exported = client.get('/api/v1/admin/conversations/export' + query, headers=ADMIN)
                self.assertEqual(exported.json()['count'], 1)
                self.assertNotIn(visitor, exported.text)
                self.assertEqual(exported.headers['cache-control'], 'no-store')
                result = client.get('/api/v1/admin/conversations/export?format=csv', headers=ADMIN)
                rows = list(csv.reader(io.StringIO(result.content.decode('utf-8-sig'))))
                self.assertTrue(rows[1][4].startswith("'=HYPERLINK"))
                self.assertIn('技术访客', rows[1])
                self.assertEqual(len(rows), 2)
                for bad in ['attention=made-up', 'visitor=abc', 'date_from=2026-11-05&date_to=2026-11-04', 'date_to=9999-12-31']:
                    self.assertEqual(client.get('/api/v1/admin/conversations?' + bad, headers=ADMIN).status_code, 422)
                self.assertEqual(client.get('/api/v1/admin/conversations/export?format=exe', headers=ADMIN).status_code, 422)

    def test_export_limit_is_explicit_not_silently_truncated(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), ReadyService)
            with TestClient(app) as client:
                wait_ready(client)
                _, cid, _ = add(app.state.conversations)
                with app.state.conversations.connect() as db:
                    db.executemany("INSERT INTO turns(id,conversation_id,question,created,status) VALUES(?,?,?,?,?)",
                                   [(uuid4().hex, cid, '批量样例', 1, 'ok') for _ in range(2000)])
                response = client.get('/api/v1/admin/conversations/export', headers=ADMIN)
                self.assertEqual(response.status_code, 413)
                self.assertIn('2000', response.json()['detail'])

    def test_recording_health_survives_missing_store(self):
        with tempfile.TemporaryDirectory() as root:
            app = create_app(settings_at(root), ReadyService)
            with TestClient(app) as client:
                wait_ready(client)
                app.state.conversations = None
                app.state.recording_error = True
                response = client.get('/api/v1/admin/changes', headers=ADMIN)
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()['recording_healthy'])
                self.assertIsNone(response.json()['revision'])
                # The original Q&A transparently reopens the database on its next request.
                self.assertEqual(client.post('/api/v1/qa', json={'question': '记录恢复测试'}).status_code, 200)
                self.assertFalse(app.state.recording_error)


if __name__ == '__main__':
    unittest.main()
