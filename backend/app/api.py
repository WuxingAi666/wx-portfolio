import asyncio
import contextlib
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.guard import AdmissionError, RequestGuard
from app.schemas import Answer, QuestionRequest, Source
from app.service import RAGService
from app.admin import admin_router
from app.conversations import ConversationConflict, ConversationStore
from app.recording import TurnRecording

logger = logging.getLogger("portfolio.api")


def create_app(settings=None, service_factory=RAGService):
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # Avoid recording signed URLs, submitted questions, or upstream bodies.
    for name in ("httpx", "httpx2", "openai", "huggingface_hub"):
        logging.getLogger(name).setLevel(logging.WARNING)

    @asynccontextmanager
    async def lifespan(app):
        app.state.guard = RequestGuard(settings)
        app.state.service = None
        app.state.startup_error = False
        app.state.conversations = None
        app.state.recording_error = False
        app.state.recording_failures = 0
        try:
            app.state.conversations = await run_in_threadpool(ConversationStore, settings)
            await run_in_threadpool(app.state.conversations.recover_interrupted)
            await run_in_threadpool(app.state.conversations.cleanup)
        except Exception as exc:
            app.state.recording_error = True
            app.state.recording_failures += 1
            logger.error('conversation_startup_failed error_type=%s', type(exc).__name__)

        async def maintain_records():
            while True:
                await asyncio.sleep(3600)
                try:
                    if app.state.conversations is None:
                        app.state.conversations = await run_in_threadpool(ConversationStore, settings)
                    if app.state.conversations:
                        await run_in_threadpool(app.state.conversations.cleanup)
                except Exception as exc:
                    app.state.recording_error = True
                    app.state.recording_failures += 1
                    logger.error('conversation_cleanup_failed error_type=%s', type(exc).__name__)

        async def initialize():
            try:
                service = await run_in_threadpool(service_factory, settings)
                app.state.service = service
                await run_in_threadpool(service.initialize)
                logger.info("service_ready chunks=%d", service.index.chunk_count)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                app.state.startup_error = True
                logger.error("service_startup_failed error_type=%s", type(exc).__name__)
        task = asyncio.create_task(initialize())
        maintenance = asyncio.create_task(maintain_records())
        yield
        maintenance.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await maintenance
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    app = FastAPI(
        title="仵星 · 作品集 RAG 助手", version="2.0.0",
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.environment == "development" else None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def request_boundary(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex
        started = time.monotonic()
        if request.method in {"POST", "PATCH", "PUT"}:
            origin = request.headers.get("origin")
            admin_same_origin = request.url.path.startswith('/api/v1/admin/') and origin == str(request.base_url).rstrip('/')
            if origin and origin not in settings.allowed_origins and not admin_same_origin:
                return JSONResponse({"detail": "不允许的网页来源"}, status_code=403)
            # Enforce the actual received size, not just the untrusted header.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > settings.max_body_bytes:
                    return JSONResponse({"detail": "请求内容过长"}, status_code=413)
            request._body = bytes(body)
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error("request_failed request_id=%s error_type=%s", request.state.request_id, type(exc).__name__)
            response = JSONResponse({"detail": "服务暂时不可用，请稍后重试", "request_id": request.state.request_id}, status_code=500)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        logger.info("http request_id=%s method=%s path=%s status=%d elapsed_ms=%d",
                    request.state.request_id, request.method, request.url.path, response.status_code,
                    int((time.monotonic()-started)*1000))
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic's default errors include raw submitted input; omit it.
        return JSONResponse({"detail": "问题或历史格式不正确，请缩短内容或开始新对话",
                             "request_id": request.state.request_id}, status_code=422)

    @app.exception_handler(AdmissionError)
    async def admission_error(request, exc):
        return JSONResponse(
            {"detail": exc.message, "request_id": request.state.request_id}, status_code=exc.status,
            headers={"Retry-After": str(exc.retry_after)},
        )

    def ready(request):
        service = request.app.state.service
        if service is None or not service.ready:
            raise HTTPException(503, "助手正在准备资料，请稍后重试")
        return service

    async def admit(request, payload):
        service = ready(request)
        ip = request.client.host if request.client else "unknown"
        await run_in_threadpool(app.state.guard.reserve, request.state.request_id, ip)
        enabled = settings.conversation_recording and payload.record_conversation
        recording = TurnRecording(app, request.state.request_id, enabled)
        if enabled:
            try:
                if app.state.conversations is None:
                    app.state.conversations = await run_in_threadpool(ConversationStore, settings)
                await run_in_threadpool(app.state.conversations.begin, request.state.request_id, payload)
                app.state.recording_error = False
            except ConversationConflict:
                app.state.guard.finish(request.state.request_id, 'error')
                raise HTTPException(409, '会话标识不匹配，请开始新对话') from None
            except Exception as exc:
                app.state.recording_error = True
                recording.enabled = False
                recording.saved = False
                app.state.recording_failures += 1
                logger.error('conversation_begin_failed error_type=%s', type(exc).__name__)
        return service, recording

    @app.get('/api/v1/chat/config', tags=['问答'])
    async def chat_config():
        return {'recording_enabled': settings.conversation_recording,
                'retention_days': settings.conversation_retention_days, 'notice_version': 'server-v2'}

    @app.get("/health/live", tags=["运行状态"])
    async def live():
        return {"status": "alive", "version": "2.0.0"}

    @app.get("/health", tags=["运行状态"])
    @app.get("/health/ready", tags=["运行状态"])
    async def readiness(request: Request):
        service = request.app.state.service
        is_ready = service is not None and service.ready
        return JSONResponse(
            {"status": "ready" if is_ready else "unavailable",
             "version": "2.0.0", "index_ready": is_ready},
            status_code=200 if is_ready else 503,
        )

    @app.post("/api/v1/qa", response_model=Answer, tags=["问答"])
    async def qa(payload: QuestionRequest, request: Request):
        service, recording = await admit(request, payload)
        rid = request.state.request_id
        text, sources, done = "", [], {}
        status = "error"
        try:
            async with asyncio.timeout(settings.request_deadline):
                async for event in service.events(payload, rid):
                    recording.observe(event)
                    if event["event"] == "token":
                        text += event["data"]["text"]
                    elif event["event"] == "sources":
                        sources = [Source(**s) for s in event["data"]["sources"]]
                    elif event["event"] == "done":
                        done = event["data"]
            status = "ok"
            recording.finish(status)
            return Answer(request_id=rid, answer=text, sources=sources,
                          grounded=done.get("grounded", False), elapsed_ms=done.get("elapsed_ms", 0),
                          recording_saved=recording.saved)
        except asyncio.CancelledError:
            status = "cancelled"
            raise
        except Exception as exc:
            logger.warning("qa_failed request_id=%s error_type=%s", rid, type(exc).__name__)
            raise HTTPException(503, "助手暂时无法完成回答，请稍后重试或查看在线简历") from None
        finally:
            recording.finish(status)
            app.state.guard.finish(rid, status, done.get("tokens", 0))

    @app.post("/api/v1/chat/stream", tags=["问答"])
    async def stream(payload: QuestionRequest, request: Request):
        service, recording = await admit(request, payload)
        rid = request.state.request_id

        async def body():
            queue = asyncio.Queue(maxsize=64)
            status, tokens = "cancelled", 0

            async def produce():
                try:
                    async with asyncio.timeout(settings.request_deadline):
                        async for event in service.events(payload, rid):
                            await queue.put(event)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.warning("stream_failed request_id=%s error_type=%s", rid, type(exc).__name__)
                    await queue.put({"event": "error", "data": {
                        "message": "回答暂时中断，请稍后重试或查看在线简历。", "request_id": rid}})
                finally:
                    # Cancellation must never block trying to put into a full queue.
                    if not asyncio.current_task().cancelling():
                        await queue.put(None)

            worker = asyncio.create_task(produce())
            try:
                yield ": connected\n\n"
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=10)
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
                        continue
                    if event is None:
                        break
                    recording.observe(event)
                    if event["event"] == "done":
                        status = "ok"
                        tokens = event["data"].get("tokens", 0)
                        recording.finish(status)
                    elif event["event"] == "error":
                        status = "error"
                    yield "event: " + event["event"] + "\ndata: " + json.dumps(event["data"], ensure_ascii=False) + "\n\n"
            finally:
                worker.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await worker
                # Synchronous tiny SQLite update ensures cleanup during disconnect.
                recording.finish(status)
                app.state.guard.finish(rid, status, tokens)
                logger.info("stream_finished request_id=%s status=%s", rid, status)

        return StreamingResponse(body(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        })

    router, authorize_admin = admin_router(app, settings)
    app.include_router(router)

    @app.get("/api/v1/admin/stats", tags=["管理"], dependencies=[Depends(authorize_admin)])
    async def stats():
        return await run_in_threadpool(app.state.guard.stats)

    # CORS is not authentication; quotas and separate admin access still apply.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )
    return app
