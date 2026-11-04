"""Capture the same answer events for JSON and SSE, including partial failures."""
import logging
import time

logger = logging.getLogger(__name__)


class TurnRecording:
    def __init__(self, app, rid, enabled):
        self.app, self.rid, self.enabled = app, rid, enabled
        self.answer, self.sources = '', []
        self.tokens, self.grounded = 0, None
        self.started, self.checkpoint = time.monotonic(), time.monotonic()
        self.finished, self.saved = False, None
        self.first_token_saved = False

    def observe(self, event):
        kind, data = event['event'], event['data']
        if kind == 'token':
            self.answer = (self.answer + data['text'])[:12000]
        elif kind == 'sources':
            self.sources = data['sources']
        elif kind == 'done':
            self.tokens = data.get('tokens', 0)
            self.grounded = data.get('grounded')
        first_token = kind == 'token' and not self.first_token_saved
        if self.enabled and kind != 'done' and (first_token or time.monotonic() - self.checkpoint >= 1):
            self.persist('active')
            if first_token:
                self.first_token_saved = True
            self.checkpoint = time.monotonic()

    def persist(self, status):
        if not self.enabled:
            return
        try:
            # One bounded SQLite write, including on ASGI cancellation; no raw text in logs.
            self.app.state.conversations.save(self.rid, self.answer, self.sources, status,
                self.tokens, int((time.monotonic()-self.started)*1000), self.grounded)
            self.saved = True if status != 'active' else None
            self.app.state.recording_error = False
        except Exception as exc:
            self.saved = False
            self.app.state.recording_error = True
            self.app.state.recording_failures += 1
            logger.error('conversation_write_failed request_id=%s error_type=%s', self.rid, type(exc).__name__)

    def finish(self, status):
        if not self.finished:
            self.persist(status)
            self.finished = True
