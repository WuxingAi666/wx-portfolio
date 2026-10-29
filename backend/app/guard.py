"""SQLite admission ledger: atomic per-IP/global quotas, survives restarts."""
import hashlib
import hmac
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone


class AdmissionError(Exception):
    def __init__(self, message, status=429, retry_after=60):
        self.message, self.status, self.retry_after = message, status, retry_after


class RequestGuard:
    def __init__(self, settings):
        self.settings = settings
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        self.path = settings.storage_dir / "usage.sqlite3"
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS requests(
                id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, day TEXT NOT NULL,
                started REAL NOT NULL, finished REAL, status TEXT NOT NULL,
                tokens INTEGER NOT NULL DEFAULT 0)""")
            db.execute("CREATE INDEX IF NOT EXISTS request_day ON requests(day, ip_hash)")
            db.execute("CREATE INDEX IF NOT EXISTS request_time ON requests(started)")

    @contextmanager
    def connect(self):
        # sqlite's own context manager commits/rolls back but does not close.
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    def reserve(self, request_id, ip):
        now = time.time()
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ip_hash = hmac.new(self.settings.rate_limit_salt.get_secret_value().encode(), ip.encode(), hashlib.sha256).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("UPDATE requests SET status='expired',finished=? WHERE status='active' AND started<?",
                       (now, now - self.settings.request_deadline - 30))
            db.execute("DELETE FROM requests WHERE started<?", (now - 30 * 86400,))
            today = db.execute("SELECT COUNT(*) FROM requests WHERE day=?", (day,)).fetchone()[0]
            ip_today = db.execute("SELECT COUNT(*) FROM requests WHERE day=? AND ip_hash=?", (day, ip_hash)).fetchone()[0]
            minute = db.execute("SELECT COUNT(*) FROM requests WHERE ip_hash=? AND started>?", (ip_hash, now - 60)).fetchone()[0]
            active = db.execute("SELECT COUNT(*) FROM requests WHERE status='active'").fetchone()[0]
            if today >= self.settings.requests_per_day or ip_today >= self.settings.requests_per_ip_day:
                raise AdmissionError("今日体验额度已用完，请查看在线简历或稍后再来。", retry_after=3600)
            if minute >= self.settings.requests_per_minute:
                raise AdmissionError("提问有点频繁，请稍等一分钟。")
            if active >= self.settings.max_concurrent:
                raise AdmissionError("当前访问较多，请稍后重试。", status=503, retry_after=10)
            db.execute("INSERT INTO requests(id,ip_hash,day,started,status) VALUES(?,?,?,?,?)",
                       (request_id, ip_hash, day, now, "active"))

    def finish(self, request_id, status, tokens=0):
        with self.connect() as db:
            db.execute("UPDATE requests SET finished=?,status=?,tokens=? WHERE id=? AND status='active'",
                       (time.time(), status, tokens, request_id))

    def stats(self):
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self.connect() as db:
            rows = db.execute("SELECT status,COUNT(*),SUM(tokens) FROM requests WHERE day=? GROUP BY status", (day,)).fetchall()
        return {"day_utc": day, "requests": [{"status": r[0], "count": r[1], "tokens": r[2]} for r in rows]}
