"""Private conversation records. Independent of quota accounting and FAISS.

One row per accepted question keeps partial answers and final states together.
Anonymous browser IDs are pseudonyms, never verified identities. Raw IPs and
client-supplied history are not stored in this database.
"""
from contextlib import contextmanager
from datetime import date, datetime, time as daytime, timedelta, timezone
import hashlib
import hmac
import json
import sqlite3
import time
import uuid

LOCAL_TZ = timezone(timedelta(hours=8))


class ConversationConflict(Exception):
    pass


def timestamp(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value else None


class ConversationStore:
    def __init__(self, settings):
        self.settings = settings
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        self.path = settings.storage_dir / 'conversations.sqlite3'
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS conversations(
                    id TEXT PRIMARY KEY, visitor_hash TEXT NOT NULL,
                    created REAL NOT NULL, updated REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS turns(
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    question TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '',
                    sources TEXT NOT NULL DEFAULT '[]',
                    created REAL NOT NULL, finished REAL, status TEXT NOT NULL,
                    tokens INTEGER NOT NULL DEFAULT 0, elapsed_ms INTEGER NOT NULL DEFAULT 0,
                    grounded INTEGER, notice_version TEXT NOT NULL DEFAULT 'anonymous-v1');
                CREATE INDEX IF NOT EXISTS conversation_updated ON conversations(updated DESC);
                CREATE INDEX IF NOT EXISTS conversation_visitor ON conversations(visitor_hash);
                CREATE INDEX IF NOT EXISTS turn_conversation ON turns(conversation_id,created);
                CREATE INDEX IF NOT EXISTS turn_created ON turns(created);
                CREATE TABLE IF NOT EXISTS visitor_profiles(
                    visitor_hash TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '');
                CREATE TABLE IF NOT EXISTS record_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
                INSERT OR IGNORE INTO record_state VALUES(1,0);
            ''')
            # Additive migration keeps all v1 questions, answers and IDs intact.
            columns = {row['name'] for row in db.execute('PRAGMA table_info(conversations)')}
            if 'reviewed_at' not in columns:
                db.execute('ALTER TABLE conversations ADD COLUMN reviewed_at REAL')
            if 'favorite' not in columns:
                db.execute('ALTER TABLE conversations ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0')
            db.execute('INSERT OR IGNORE INTO visitor_profiles(visitor_hash) SELECT DISTINCT visitor_hash FROM conversations')
            db.execute('PRAGMA user_version=2')

    @staticmethod
    def bump(db):
        db.execute('UPDATE record_state SET revision=revision+1 WHERE id=1')

    def revision(self):
        with self.connect() as db:
            return db.execute('SELECT revision FROM record_state WHERE id=1').fetchone()[0]

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA secure_delete=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def recover_interrupted(self):
        # Called once per process startup; deployment currently uses one worker.
        now = time.time()
        with self.connect() as db:
            if db.execute("UPDATE turns SET status='interrupted',finished=? WHERE status='active'", (now,)).rowcount:
                self.bump(db)

    def cleanup(self):
        cutoff = time.time() - self.settings.conversation_retention_days * 86400
        with self.connect() as db:
            before = db.total_changes
            # Retention applies per turn, including old turns in an active thread.
            db.execute('DELETE FROM turns WHERE created<?', (cutoff,))
            db.execute('DELETE FROM conversations WHERE NOT EXISTS (SELECT 1 FROM turns WHERE conversation_id=conversations.id)')
            db.execute("UPDATE turns SET status='interrupted',finished=? WHERE status='active' AND created<?",
                       (time.time(), time.time() - self.settings.request_deadline - 30))
            db.execute('DELETE FROM visitor_profiles WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE conversations.visitor_hash=visitor_profiles.visitor_hash)')
            if db.total_changes > before:
                self.bump(db)

    def begin(self, rid, payload):
        cid = str(payload.conversation_id or uuid.uuid4())
        visitor = str(payload.visitor_id or uuid.uuid4())
        visitor_hash = hmac.new(self.settings.rate_limit_salt.get_secret_value().encode(),
                                ('conversation-visitor:' + visitor).encode(), hashlib.sha256).hexdigest()
        now = time.time()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            owner = db.execute('SELECT visitor_hash FROM conversations WHERE id=?', (cid,)).fetchone()
            if owner and not hmac.compare_digest(owner[0], visitor_hash):
                raise ConversationConflict('Anonymous conversation belongs to a different browser ID')
            if not owner:
                db.execute('INSERT INTO conversations(id,visitor_hash,created,updated) VALUES(?,?,?,?)', (cid, visitor_hash, now, now))
            db.execute('INSERT OR IGNORE INTO visitor_profiles(visitor_hash) VALUES(?)', (visitor_hash,))
            db.execute('UPDATE conversations SET updated=? WHERE id=?', (now, cid))
            db.execute("INSERT INTO turns(id,conversation_id,question,created,status,notice_version) VALUES(?,?,?,?,'active','server-v2')",
                       (rid, cid, payload.question, now))
            self.bump(db)
        return cid

    def save(self, rid, answer, sources, status, tokens=0, elapsed_ms=0, grounded=None):
        # Bounded content and parameterized SQL prevent unbounded storage and SQL injection.
        finished = None if status == 'active' else time.time()
        with self.connect() as db:
            changed = db.execute('''UPDATE turns SET answer=?,sources=?,status=?,finished=?,tokens=?,elapsed_ms=?,grounded=?
                          WHERE id=? AND status='active' ''',
                       (answer[:12000], json.dumps(sources[:6], ensure_ascii=False), status, finished,
                        max(0, tokens), max(0, elapsed_ms), None if grounded is None else int(grounded), rid)).rowcount
            if changed:
                db.execute('UPDATE conversations SET updated=? WHERE id=(SELECT conversation_id FROM turns WHERE id=?)',
                           (time.time(), rid))
                self.bump(db)

    @staticmethod
    def filters(search='', status='', date_from=None, date_to=None, visitor='', attention=''):
        clauses, args = [], []
        if search:
            literal = search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            clauses.append("(t.question LIKE ? ESCAPE '\\' OR t.answer LIKE ? ESCAPE '\\' OR c.visitor_hash LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\' OR p.notes LIKE ? ESCAPE '\\')")
            args.extend(['%' + literal + '%'] * 5)
        if status:
            clauses.append('t.status=?')
            args.append(status)
        if date_from:
            clauses.append('t.created>=?')
            args.append(datetime.combine(date_from, daytime.min, LOCAL_TZ).timestamp())
        if date_to:
            clauses.append('t.created<?')
            args.append(datetime.combine(date_to + timedelta(days=1), daytime.min, LOCAL_TZ).timestamp())
        if visitor:
            clauses.append('c.visitor_hash=?')
            args.append(visitor)
        if attention == 'unread':
            clauses.append('t.created>COALESCE(c.reviewed_at,0)')
        elif attention == 'favorite':
            clauses.append('c.favorite=1')
        elif attention == 'ungrounded':
            clauses.append("t.status='ok' AND t.grounded=0")
        return (' WHERE ' + ' AND '.join(clauses) if clauses else ''), args

    JOIN = ' FROM turns t JOIN conversations c ON c.id=t.conversation_id LEFT JOIN visitor_profiles p ON p.visitor_hash=c.visitor_hash '

    def overview(self, **filters):
        where, args = self.filters(**filters)
        with self.connect() as db:
            summary = dict(db.execute('''SELECT COUNT(*) AS turns,
                COUNT(DISTINCT c.id) AS conversations, COUNT(DISTINCT c.visitor_hash) AS visitors,
                COALESCE(SUM(t.status='ok'),0) AS completed,
                COALESCE(SUM(t.status IN ('error','interrupted')),0) AS failed,
                COALESCE(SUM(t.status='cancelled'),0) AS cancelled,
                COALESCE(SUM(t.status='active'),0) AS active,
                COALESCE(SUM(t.status='ok' AND t.grounded=0),0) AS ungrounded,
                COUNT(DISTINCT CASE WHEN t.created>COALESCE(c.reviewed_at,0) THEN c.id END) AS unread,
                COALESCE(AVG(CASE WHEN t.status='ok' THEN t.elapsed_ms END),0) AS avg_elapsed_ms,
                COALESCE(SUM(t.tokens),0) AS tokens''' + self.JOIN + where, args).fetchone())
            today = datetime.now(LOCAL_TZ).date()
            trend = db.execute("SELECT date(t.created,'unixepoch','+8 hours') AS day,COUNT(*) AS count" + self.JOIN + where +
                               " GROUP BY day ORDER BY day", args).fetchall()
            counts = {r['day']: r['count'] for r in trend}
            summary['trend'] = [{'date': (today-timedelta(days=i)).isoformat(), 'count': counts.get((today-timedelta(days=i)).isoformat(), 0)} for i in reversed(range(7))]
            summary['top_questions'] = [dict(r) for r in db.execute('SELECT t.question, COUNT(*) AS count' + self.JOIN + where +
                ' GROUP BY t.question ORDER BY count DESC,MAX(t.created) DESC LIMIT 5', args).fetchall()]
        return summary

    def list(self, search='', status='', date_from=None, date_to=None, page=1, page_size=20, visitor='', attention=''):
        where, args = self.filters(search, status, date_from, date_to, visitor, attention)
        # Filter matching turns first, then return their conversations and whole-thread counts.
        select = 'SELECT DISTINCT c.id' + self.JOIN + where
        with self.connect() as db:
            total = db.execute('SELECT COUNT(*) FROM (' + select + ')', args).fetchone()[0]
            rows = db.execute('''SELECT c.*,p.display_name,
                (SELECT COUNT(*) FROM turns WHERE conversation_id=c.id) AS turn_count,
                (SELECT question FROM turns WHERE conversation_id=c.id ORDER BY created LIMIT 1) AS title,
                (SELECT status FROM turns WHERE conversation_id=c.id ORDER BY created DESC LIMIT 1) AS status,
                EXISTS(SELECT 1 FROM turns WHERE conversation_id=c.id AND created>COALESCE(c.reviewed_at,0)) AS unread
                FROM conversations c LEFT JOIN visitor_profiles p ON p.visitor_hash=c.visitor_hash WHERE c.id IN (''' + select + ''')
                ORDER BY c.updated DESC,c.id LIMIT ? OFFSET ?''', args + [page_size, (page-1)*page_size]).fetchall()
        items = [dict(id=r['id'], visitor='访客 ' + r['visitor_hash'][:12], title=r['title'],
                      visitor_id=r['visitor_hash'], display_name=r['display_name'] or '', favorite=bool(r['favorite']), unread=bool(r['unread']),
                      created_at=timestamp(r['created']), updated_at=timestamp(r['updated']),
                      turn_count=r['turn_count'], status=r['status']) for r in rows]
        return {'items': items, 'total': total, 'page': page, 'page_size': page_size}

    def visitors(self, page=1, page_size=20, **filters):
        where, args = self.filters(**filters)
        with self.connect() as db:
            total = db.execute('SELECT COUNT(DISTINCT c.visitor_hash)' + self.JOIN + where, args).fetchone()[0]
            rows = db.execute('''SELECT c.visitor_hash,p.display_name,p.notes,
                COUNT(DISTINCT c.id) AS conversations,COUNT(*) AS turns,
                COUNT(DISTINCT CASE WHEN t.created>COALESCE(c.reviewed_at,0) THEN c.id END) AS unread,
                MIN(t.created) AS first_seen, MAX(c.updated) AS last_seen,
                COALESCE(SUM(t.status='active'),0) AS active''' + self.JOIN + where +
                ' GROUP BY c.visitor_hash ORDER BY last_seen DESC,c.visitor_hash LIMIT ? OFFSET ?', args+[page_size,(page-1)*page_size]).fetchall()
        return {'items': [dict(id=r['visitor_hash'], label='访客 '+r['visitor_hash'][:12],
                              display_name=r['display_name'] or '', notes=r['notes'] or '',
                              conversations=r['conversations'], turns=r['turns'], unread=r['unread'], active=r['active'],
                              first_seen=timestamp(r['first_seen']), last_seen=timestamp(r['last_seen'])) for r in rows],
                'total': total, 'page': page, 'page_size': page_size}

    def profile(self, visitor):
        with self.connect() as db:
            row = db.execute('''SELECT p.*,COUNT(DISTINCT c.id) AS conversations,COUNT(t.id) AS turns,
                MIN(t.created) AS first_seen,MAX(c.updated) AS last_seen
                FROM visitor_profiles p JOIN conversations c ON c.visitor_hash=p.visitor_hash
                JOIN turns t ON t.conversation_id=c.id WHERE p.visitor_hash=? GROUP BY p.visitor_hash''', (visitor,)).fetchone()
        if not row:
            return None
        return dict(id=visitor, label='访客 '+visitor[:12], display_name=row['display_name'], notes=row['notes'],
                    conversations=row['conversations'], turns=row['turns'], first_seen=timestamp(row['first_seen']),last_seen=timestamp(row['last_seen']))

    def update_profile(self, visitor, display_name, notes):
        with self.connect() as db:
            changed = db.execute('UPDATE visitor_profiles SET display_name=?,notes=? WHERE visitor_hash=?', (display_name, notes, visitor)).rowcount
            if changed:
                self.bump(db)
        return self.profile(visitor) if changed else None

    def annotate(self, cid, favorite=None, reviewed=None):
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM conversations WHERE id=?', (cid,)).fetchone():
                return False
            if favorite is not None:
                db.execute('UPDATE conversations SET favorite=? WHERE id=?', (int(favorite), cid))
            if reviewed is not None:
                db.execute('UPDATE conversations SET reviewed_at=? WHERE id=?', (time.time() if reviewed else None, cid))
            self.bump(db)
        return True

    def export_rows(self, **filters):
        where, args = self.filters(**filters)
        with self.connect() as db:
            # Hard cap is explicit: API rejects instead of silently truncating an export.
            rows = db.execute('SELECT t.*,c.visitor_hash,p.display_name,c.favorite' + self.JOIN + where +
                              ' ORDER BY t.created,t.id LIMIT 2001', args).fetchall()
        if len(rows) > 2000:
            raise ValueError('export_limit')
        return [dict(visitor='访客 '+r['visitor_hash'][:12], display_name=r['display_name'],
                     conversation_id=r['conversation_id'], request_id=r['id'],question=r['question'],answer=r['answer'],
                     status=r['status'],created_at=timestamp(r['created']),elapsed_ms=r['elapsed_ms'],tokens=r['tokens'],
                     grounded=None if r['grounded'] is None else bool(r['grounded']),favorite=bool(r['favorite']),sources=json.loads(r['sources'])) for r in rows]

    def detail(self, cid):
        with self.connect() as db:
            conversation = db.execute('''SELECT c.*,p.display_name,p.notes,
                EXISTS(SELECT 1 FROM turns WHERE conversation_id=c.id AND created>COALESCE(c.reviewed_at,0)) AS unread
                FROM conversations c LEFT JOIN visitor_profiles p ON p.visitor_hash=c.visitor_hash WHERE c.id=?''', (cid,)).fetchone()
            if not conversation:
                return None
            rows = db.execute('SELECT * FROM turns WHERE conversation_id=? ORDER BY created,id', (cid,)).fetchall()
        turns = [dict(id=r['id'], question=r['question'], answer=r['answer'], sources=json.loads(r['sources']),
                      created_at=timestamp(r['created']), finished_at=timestamp(r['finished']), status=r['status'],
                      tokens=r['tokens'], elapsed_ms=r['elapsed_ms'], grounded=None if r['grounded'] is None else bool(r['grounded'])) for r in rows]
        return {'id': cid, 'visitor': '访客 ' + conversation['visitor_hash'][:12],
                'visitor_id': conversation['visitor_hash'], 'display_name': conversation['display_name'] or '',
                'notes': conversation['notes'] or '', 'favorite': bool(conversation['favorite']), 'unread': bool(conversation['unread']),
                'created_at': timestamp(conversation['created']), 'updated_at': timestamp(conversation['updated']), 'turns': turns}

    def delete(self, cid):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM turns WHERE conversation_id=? AND status='active'", (cid,)).fetchone():
                return 'active'
            deleted = db.execute('DELETE FROM conversations WHERE id=?', (cid,)).rowcount
            if deleted:
                db.execute('DELETE FROM visitor_profiles WHERE NOT EXISTS(SELECT 1 FROM conversations WHERE conversations.visitor_hash=visitor_profiles.visitor_hash)')
                self.bump(db)
        return 'deleted' if deleted else 'missing'
