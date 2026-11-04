"""Same-origin owner console: short-lived HttpOnly sessions; no credentials in JS."""
from datetime import date
import csv
import io
import hashlib
import hmac
import secrets
import time
import threading
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from app.passwords import verify_password

ASSETS = Path(__file__).parent / 'admin_assets'
COOKIE = 'wx_admin_session'
STATUSES = {'', 'active', 'ok', 'error', 'cancelled', 'interrupted'}


def secure_transport(request):
    # Never trust a Host header to decide this. Uvicorn trusts only the configured proxy.
    client = request.client.host if request.client else ''
    if request.url.scheme != 'https' and client not in {'127.0.0.1', '::1', 'testclient'}:
        raise HTTPException(403, '管理后台仅允许 HTTPS 或本机 SSH 隧道访问')


def mutation_boundary(request):
    if request.method not in {'GET', 'HEAD'}:
        if request.headers.get('X-Admin-Request') != '1':
            raise HTTPException(403, '缺少管理员请求校验')
        origin = request.headers.get('origin')
        if origin and origin.rstrip('/') != str(request.base_url).rstrip('/'):
            raise HTTPException(403, '管理操作必须来自同一站点')


class AdminAccess:
    def __init__(self, settings):
        self.settings = settings
        self.sessions = {}
        self.attempts = {}
        self.login_lock = threading.Lock()

    def prune(self):
        now = time.time()
        self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
        self.attempts = {key: values for key, values in self.attempts.items() if values and values[-1] > now-600}

    def login(self, request, token):
        # Serialize bounded password verification and attempt counting in a worker.
        with self.login_lock:
            return self._login(request, token)

    def _login(self, request, token):
        self.prune()
        key = request.client.host if request.client else 'unknown'
        attempts = [t for t in self.attempts.get(key, []) if t > time.time()-600]
        if len(attempts) >= 5:
            raise HTTPException(429, '尝试过于频繁，请十分钟后再试', headers={'Retry-After': '600'})
        expected = self.settings.admin_token.get_secret_value() if self.settings.admin_token else ''
        encoded = self.settings.admin_password_hash
        accepted = (verify_password(token, encoded.get_secret_value()) if encoded
                    else bool(expected) and hmac.compare_digest(expected.encode(), token.encode()))
        if not accepted:
            if len(self.attempts) >= 1024:
                raise HTTPException(429, '暂时无法登录，请稍后重试')
            self.attempts[key] = attempts + [time.time()]
            raise HTTPException(401, '登录密码不正确')
        self.attempts.pop(key, None)
        if len(self.sessions) >= 32:
            self.sessions.pop(next(iter(self.sessions)))
        raw = secrets.token_urlsafe(32)
        self.sessions[hashlib.sha256(raw.encode()).hexdigest()] = time.time() + self.settings.admin_session_hours*3600
        return raw

    def authorized(self, request):
        secure_transport(request)
        mutation_boundary(request)
        self.prune()
        expected = self.settings.admin_token.get_secret_value() if self.settings.admin_token else ''
        bearer = request.headers.get('authorization', '')
        if expected and hmac.compare_digest(bearer.encode(), ('Bearer ' + expected).encode()):
            return
        raw = request.cookies.get(COOKIE, '')
        if raw and hashlib.sha256(raw.encode()).hexdigest() in self.sessions:
            return
        raise HTTPException(401, '请先登录管理后台')


class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=1, max_length=256)


class VisitorEdit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    display_name: str = Field('', max_length=40)
    notes: str = Field('', max_length=1000)


class ConversationEdit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    favorite: bool | None = None
    reviewed: bool | None = None


def record_filters(search: str = Query('', max_length=100), status: str = '',
                   date_from: date | None = None, date_to: date | None = None,
                   visitor: str = Query('', pattern=r'^(?:[a-f0-9]{64})?$'), attention: str = ''):
    if (status not in STATUSES or attention not in {'', 'unread', 'favorite', 'ungrounded'} or
            date_to == date.max or date_from and date_to and date_from > date_to):
        raise HTTPException(422, '筛选条件不正确')
    return dict(search=search.strip(), status=status, date_from=date_from, date_to=date_to,
                visitor=visitor, attention=attention)


def admin_router(app, settings):
    router = APIRouter()
    access = AdminAccess(settings)

    async def authorized(request: Request):
        access.authorized(request)

    def store():
        if app.state.conversations is None:
            raise HTTPException(503, '聊天记录库暂时不可用')
        return app.state.conversations

    @router.get('/admin/', include_in_schema=False)
    @router.get('/kanban/', include_in_schema=False)
    async def page():
        return FileResponse(ASSETS / 'index.html', headers={'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer'})

    @router.get('/admin/assets/{name}', include_in_schema=False)
    @router.get('/kanban/assets/{name}', include_in_schema=False)
    async def asset(name: str):
        if name not in {'admin.css', 'admin.js', 'favicon.svg'}:
            raise HTTPException(404)
        return FileResponse(ASSETS / name, headers={'Cache-Control': 'no-store'})

    @router.post('/api/v1/admin/session')
    async def login(payload: Login, request: Request, response: Response):
        secure_transport(request)
        mutation_boundary(request)
        raw = await run_in_threadpool(access.login, request, payload.token)
        response.set_cookie(COOKIE, raw, max_age=settings.admin_session_hours*3600,
                            httponly=True, secure=request.url.scheme == 'https', samesite='strict', path='/')
        return {'authenticated': True}

    @router.get('/api/v1/admin/session')
    async def session(request: Request):
        try:
            access.authorized(request)
        except HTTPException as exc:
            if exc.status_code != 401:
                raise
            return {'authenticated': False}
        return {'authenticated': True, 'retention_days': settings.conversation_retention_days,
                'recording_enabled': settings.conversation_recording,
                'recording_healthy': not app.state.recording_error,
                'recording_failures': app.state.recording_failures}

    @router.delete('/api/v1/admin/session', dependencies=[Depends(authorized)])
    async def logout(request: Request, response: Response):
        access.sessions.pop(hashlib.sha256(request.cookies.get(COOKIE, '').encode()).hexdigest(), None)
        response.delete_cookie(COOKIE, path='/')
        return {'authenticated': False}

    @router.get('/api/v1/admin/conversations/overview', dependencies=[Depends(authorized)])
    async def overview(filters: dict = Depends(record_filters)):
        return await run_in_threadpool(store().overview, **filters)

    @router.get('/api/v1/admin/changes', dependencies=[Depends(authorized)])
    async def changes():
        return {'revision': await run_in_threadpool(app.state.conversations.revision) if app.state.conversations else None,
                'recording_healthy': not app.state.recording_error,
                'recording_failures': app.state.recording_failures,
                'recording_enabled': settings.conversation_recording}

    @router.get('/api/v1/admin/visitors', dependencies=[Depends(authorized)])
    async def visitors(filters: dict = Depends(record_filters), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50)):
        return await run_in_threadpool(store().visitors, page=page, page_size=page_size, **filters)

    @router.get('/api/v1/admin/visitors/{visitor_id}', dependencies=[Depends(authorized)])
    async def profile(visitor_id: str):
        result = await run_in_threadpool(store().profile, visitor_id)
        if result is None:
            raise HTTPException(404, '访客不存在或记录已清理')
        return result

    @router.patch('/api/v1/admin/visitors/{visitor_id}', dependencies=[Depends(authorized)])
    async def edit_profile(visitor_id: str, payload: VisitorEdit):
        result = await run_in_threadpool(store().update_profile, visitor_id, payload.display_name.strip(), payload.notes.strip())
        if result is None:
            raise HTTPException(404, '访客不存在或记录已清理')
        return result

    @router.get('/api/v1/admin/conversations/export', dependencies=[Depends(authorized)])
    async def export(filters: dict = Depends(record_filters), format: str = 'json'):
        if format not in {'csv', 'json'}:
            raise HTTPException(422, '不支持的导出格式')
        try:
            rows = await run_in_threadpool(store().export_rows, **filters)
        except ValueError:
            raise HTTPException(413, '一次最多导出 2000 条问答，请缩小日期范围或选择访客') from None
        headers = {'Content-Disposition': f'attachment; filename="conversations.{format}"'}
        if format == 'json':
            return JSONResponse({'timezone': 'Asia/Shanghai', 'count': len(rows), 'items': rows}, headers=headers)
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        fields = ['visitor', 'display_name', 'conversation_id', 'created_at', 'question', 'answer', 'status', 'elapsed_ms', 'tokens', 'grounded', 'favorite']
        writer.writerow(['匿名访客', '管理员备注名', '会话ID', '时间(ISO8601)', '问题', '回答', '状态', '耗时毫秒', 'Token', '资料召回', '收藏'])
        for row in rows:
            values = []
            for field in fields:
                value = str(row[field]) if row[field] is not None else ''
                # Spreadsheet applications must not interpret visitor text as formulas.
                if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n')):
                    value = "'" + value
                values.append(value)
            writer.writerow(values)
        return Response('\ufeff' + output.getvalue(), media_type='text/csv; charset=utf-8', headers=headers)

    @router.get('/api/v1/admin/conversations', dependencies=[Depends(authorized)])
    async def listing(filters: dict = Depends(record_filters),
                      page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50)):
        return await run_in_threadpool(store().list, page=page, page_size=page_size, **filters)

    @router.patch('/api/v1/admin/conversations/{cid}', dependencies=[Depends(authorized)])
    async def annotate(cid: UUID, payload: ConversationEdit):
        if not await run_in_threadpool(store().annotate, str(cid), payload.favorite, payload.reviewed):
            raise HTTPException(404, '会话不存在或已清理')
        return {'updated': True}

    @router.get('/api/v1/admin/conversations/{cid}', dependencies=[Depends(authorized)])
    async def detail(cid: UUID, export: bool = False):
        result = await run_in_threadpool(store().detail, str(cid))
        if result is None:
            raise HTTPException(404, '会话不存在或已清理')
        headers = {'Content-Disposition': f'attachment; filename="conversation-{cid}.json"'} if export else {}
        return JSONResponse(result, headers=headers)

    @router.delete('/api/v1/admin/conversations/{cid}', dependencies=[Depends(authorized)])
    async def delete(cid: UUID):
        result = await run_in_threadpool(store().delete, str(cid))
        if result == 'active':
            raise HTTPException(409, '会话仍在生成回答，请结束后再删除')
        if result == 'missing':
            raise HTTPException(404, '会话不存在或已清理')
        return {'deleted': True}

    return router, authorized
