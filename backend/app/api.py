import asyncio
import contextlib
import hmac
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.guard import AdmissionError, RequestGuard
from app.schemas import Answer, QuestionRequest, Source
from app.service import RAGService

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
        yield
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
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and origin not in settings.allowed_origins:
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

    async def admit(request):
        service = ready(request)
        ip = request.client.host if request.client else "unknown"
        await run_in_threadpool(app.state.guard.reserve, request.state.request_id, ip)
        return service

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
        service = await admit(request)
        rid = request.state.request_id
        text, sources, done = "", [], {}
        status = "error"
        try:
            async with asyncio.timeout(settings.request_deadline):
                async for event in service.events(payload, rid):
                    if event["event"] == "token":
                        text += event["data"]["text"]
                    elif event["event"] == "sources":
                        sources = [Source(**s) for s in event["data"]["sources"]]
                    elif event["event"] == "done":
                        done = event["data"]
            status = "ok"
            return Answer(request_id=rid, answer=text, sources=sources,
                          grounded=done.get("grounded", False), elapsed_ms=done.get("elapsed_ms", 0))
        except asyncio.CancelledError:
            status = "cancelled"
            raise
        except Exception as exc:
            logger.warning("qa_failed request_id=%s error_type=%s", rid, type(exc).__name__)
            raise HTTPException(503, "助手暂时无法完成回答，请稍后重试或查看在线简历") from None
        finally:
            await run_in_threadpool(app.state.guard.finish, rid, status, done.get("tokens", 0))

    @app.post("/api/v1/chat/stream", tags=["问答"])
    async def stream(payload: QuestionRequest, request: Request):
        service = await admit(request)
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
                    if event["event"] == "done":
                        status = "ok"
                        tokens = event["data"].get("tokens", 0)
                    elif event["event"] == "error":
                        status = "error"
                    yield "event: " + event["event"] + "\ndata: " + json.dumps(event["data"], ensure_ascii=False) + "\n\n"
            finally:
                worker.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await worker
                # Synchronous tiny SQLite update ensures cleanup during disconnect.
                app.state.guard.finish(rid, status, tokens)
                logger.info("stream_finished request_id=%s status=%s", rid, status)

        return StreamingResponse(body(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        })

    @app.get("/api/v1/admin/stats", tags=["管理"])
    async def stats(authorization: str | None = Header(default=None)):
        expected = settings.admin_token.get_secret_value() if settings.admin_token else None
        if not expected or not hmac.compare_digest(authorization or "", "Bearer " + expected):
            raise HTTPException(401, "需要管理员身份")
        return await run_in_threadpool(app.state.guard.stats)

    # CORS is not authentication; quotas and separate admin access still apply.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )
    return app
