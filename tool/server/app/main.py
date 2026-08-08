from contextlib import asynccontextmanager
from collections import defaultdict, deque
import logging
import time
import os
from threading import Event, Lock, Thread

from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from fastapi.responses import HTMLResponse

from app.routes import templates, mapping, generation, fonts
from app.routes import workspaces
from app.routes import licensing
from app.routes import admin_settings
from app.routes import admin_dashboard
from app.routes import admin_usage
from app.routes.admin_ui import auth_required_page
from app.services.workspace_cleanup import cleanup_loop
from app.services.storage import (
    InvalidWorkspaceId,
    InvalidWorkspacePath,
    UploadTooLarge,
    clear_all_workspaces,
)
from app.services.upload_security import UnsafeUpload, max_request_bytes
from app.services import throttle
from app.services import metrics as metrics_service
from app.services import system_stats
from app.services.bandwidth import get_download_bucket, get_upload_bucket
from app.services.licensing import (
    get_device_id_from_headers,
    get_required_license_key_from_headers,
    record_license_seen,
    validate_license,
)
from app.routes.licensing import (
    _encode_admin_session,
    admin_basic_auth_valid,
    clear_admin_session_cookie,
    get_license_session_credentials,
    get_admin_session_state,
    request_is_secure,
    set_admin_session_cookie,
)


logger = logging.getLogger("ymga.licensing")
access_logger = logging.getLogger("ymga.access")
if not access_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    access_logger.addHandler(_handler)
access_logger.setLevel(logging.INFO)
access_logger.propagate = False

# Disable uvicorn's default access logs to avoid duplicate lines.
logging.getLogger("uvicorn.access").disabled = True


def _license_hint(reason: str | None) -> str | None:
    if not reason:
        return None
    # Keep this short and user-actionable.
    if reason == "missing":
        return "No license key was provided. Enter/request a key in the UI."
    if reason in {"format", "not_found"}:
        return "The license key is invalid. Re-enter the key or request a new one."
    if reason == "revoked":
        return "This license key was revoked. Use a different key."
    if reason == "expired":
        return "This license key expired. Use a different key."
    if reason == "device_required":
        return "This license requires a device id. Make sure X-Device-Id is being sent."
    if reason == "device_mismatch":
        return "Device id changed since the key was issued. Request a new key on this device/browser."
    if reason == "ip_required":
        return "This license requires an IP binding."
    if reason == "ip_mismatch":
        return "IP changed since the key was issued. Request a new key or use the same network."
    if reason == "monthly_limit":
        return "Monthly usage limit reached for this key."
    if reason == "max_uses":
        return "Usage limit reached for this key."
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply the admin-configured CPU thread cap + process priority (defaults to
    # "auto" / normal priority, matching the previous hardcoded behavior).
    throttle.apply_cpu_limits()

    # Local/dev convenience: wipe uploaded data on server start.
    # Set YMGA_CLEAR_WORKSPACES_ON_STARTUP=false to preserve workspaces.
    # Note: internal underscore-prefixed folders under `server/app/data/` (e.g. `_licenses`)
    # are preserved so license records/secrets persist across restarts.
    clear_on_startup = os.getenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    if clear_on_startup:
        try:
            clear_all_workspaces()
        except Exception:
            # Best-effort; do not prevent server from starting.
            pass

    stop_event = Event()
    thread = Thread(target=cleanup_loop, args=(stop_event,), daemon=True)
    thread.start()

    resource_stop_event = Event()
    resource_thread = Thread(target=system_stats.resource_history_loop, args=(resource_stop_event,), daemon=True)
    resource_thread.start()
    try:
        yield
    finally:
        stop_event.set()
        thread.join(timeout=1.0)
        resource_stop_event.set()
        resource_thread.join(timeout=1.0)


api_docs_enabled = (os.getenv("YMGA_ENABLE_API_DOCS", "false") or "false").strip().lower() in {"1", "true", "yes", "on"}
app = FastAPI(
    title="Yearbook Mugshot Automator",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if api_docs_enabled else None,
    redoc_url="/redoc" if api_docs_enabled else None,
    openapi_url="/openapi.json" if api_docs_enabled else None,
)

allowed_hosts = [
    host.strip()
    for host in (os.getenv("YMGA_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver") or "").split(",")
    if host.strip()
]


_LICENSE_PROTECTED_PREFIXES = (
    "/api/templates",
    "/api/mapping",
    "/api/generation",
    "/api/fonts",
    "/api/workspaces",
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        access_logger.exception(
            "%s %s -> 500 (%.1f ms)",
            request.method,
            request.url.path,
            duration_ms,
        )
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    access_logger.info(
        "%s %s -> %s (%.1f ms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.middleware("http")
async def license_guard(request: Request, call_next):
    # Allow CORS preflights.
    if request.method.upper() == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    # Allow licensing endpoints, admin panel, and health/docs.
    if (
        path.startswith("/api/licensing")
        or path.startswith("/admin")
        or path in {"/health", "/docs", "/openapi.json", "/redoc"}
    ):
        return await call_next(request)

    if path.startswith(_LICENSE_PROTECTED_PREFIXES):
        # Browser-managed previews and downloads authenticate with HttpOnly,
        # SameSite cookies so credentials never appear in URLs or proxy logs.
        cookie_key, cookie_device_id = get_license_session_credentials(request)
        key = get_required_license_key_from_headers(request.headers) or cookie_key
        device_id = get_device_id_from_headers(request.headers) or cookie_device_id
        forwarded = request.headers.get("x-forwarded-for")
        ip = (forwarded.split(",")[0].strip() if forwarded else None) or (request.client.host if request.client else None)

        ok, meta = validate_license(key or "", ip=ip, device_id=device_id)
        if not ok:
            reason = str(meta.get("reason") or "") or None
            # Log why the request was rejected (access logs only show status code).
            logger.warning(
                "License rejected: %s %s reason=%s has_key=%s has_device_id=%s ip=%s",
                request.method,
                path,
                reason,
                bool(key),
                bool(device_id),
                ip,
            )
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "License key required",
                    "reason": reason,
                    "hint": _license_hint(reason),
                },
            )

        record_license_seen(key or "", ip=ip, device_id=device_id)

        # Expose validated license context for downstream handlers.
        request.state.license_key = key
        request.state.license_device_id = device_id
        request.state.license_meta = meta
        request.state.client_session_id = (
            request.headers.get("x-client-session-id")
            or request.headers.get("X-Client-Session-Id")
        )

    return await call_next(request)


@app.middleware("http")
async def admin_session_guard(request: Request, call_next):
    path = request.url.path
    is_admin_path = path.startswith("/admin") or path == "/"
    if not is_admin_path:
        return await call_next(request)

    if path in {"/admin/logout"}:
        return await call_next(request)

    if request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
        fetch_site = (request.headers.get("sec-fetch-site") or "").strip().lower()
        if fetch_site == "cross-site":
            return JSONResponse(status_code=403, content={"detail": "Cross-site admin request blocked"})

    is_valid, reason, refreshed_token = get_admin_session_state(request)
    if not is_valid:
        if admin_basic_auth_valid(request):
            response = await call_next(request)
            token = _encode_admin_session(iat=int(time.time()), lat=int(time.time()))
            set_admin_session_cookie(response, token, secure=request_is_secure(request))
            return response

        status_msg = "Admin authentication required"
        if reason == "idle":
            status_msg = "Admin session expired due to inactivity"
        elif reason == "max_age":
            status_msg = "Admin session expired"
        elif reason == "invalid":
            status_msg = "Invalid admin session"
        elif reason == "not_configured":
            status_msg = "Admin access is disabled until a strong password is configured"

        resp = HTMLResponse(
            content=auth_required_page(status_msg),
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="YMGA Admin", charset="UTF-8"'},
        )
        clear_admin_session_cookie(resp)
        return resp

    response = await call_next(request)
    if refreshed_token:
        set_admin_session_cookie(response, refreshed_token, secure=request_is_secure(request))
    return response


class TrafficMiddleware:
    """Outermost ASGI layer: bandwidth throttling + full-coverage request metrics.

    Implemented as a raw ASGI middleware (not `@app.middleware("http")`, which
    uses `BaseHTTPMiddleware` and would buffer the request/response instead of
    exposing real byte-level chunks) so it can:
      - throttle incoming upload bytes and outgoing download bytes to the
        admin-configured KB/s caps, and
      - record metrics for *every* request/response, including ones rejected
        early by the license/admin guards below it (those never reach the
        `access_log` BaseHTTPMiddleware since it sits further inside the stack).

    Registered last (see bottom of this file) so it ends up outermost.
    """

    def __init__(self, app):
        self.app = app
        self._capacity_lock = Lock()
        self._active_requests = 0
        self._rate_lock = Lock()
        self._rate_windows: dict[str, deque[float]] = defaultdict(deque)

    @staticmethod
    async def _send_json(send, status: int, payload: bytes, *, extra_headers: list[tuple[bytes, bytes]] | None = None):
        headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode("ascii"))]
        headers.extend(extra_headers or [])
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": payload})

    def _rate_allowed(self, key: str, *, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._rate_lock:
            bucket = self._rate_windows[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            if len(self._rate_windows) > 10_000:
                stale_keys = [name for name, values in self._rate_windows.items() if not values or values[-1] <= cutoff]
                for name in stale_keys[:2_000]:
                    self._rate_windows.pop(name, None)
            return True

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")
        method = str(scope.get("method") or "GET").upper()
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}

        if method in {"POST", "PUT", "PATCH"}:
            content_length = headers.get("content-length")
            if content_length:
                try:
                    declared_size = int(content_length)
                except ValueError:
                    await self._send_json(send, 400, b'{"detail":"Invalid Content-Length"}')
                    return
                if declared_size < 0 or declared_size > max_request_bytes():
                    await self._send_json(send, 413, b'{"detail":"Request body exceeds the configured upload limit"}')
                    return

        client_host = str((scope.get("client") or ("unknown", 0))[0])
        client_id = headers.get("cf-connecting-ip") or headers.get("x-forwarded-for", "").split(",", 1)[0].strip() or client_host
        device_id = headers.get("x-device-id", "")[:128]
        license_key = headers.get("x-license-key", "")[:128]
        if path == "/api/licensing/free-key":
            if not self._rate_allowed(f"free:{client_id}:{device_id}", limit=5, window_seconds=60 * 60):
                await self._send_json(
                    send,
                    429,
                    b'{"detail":"Too many free-key requests"}',
                    extra_headers=[(b"retry-after", b"3600")],
                )
                return
        elif path == "/api/licensing/validate":
            if not self._rate_allowed(f"validate:{client_id}", limit=30, window_seconds=60):
                await self._send_json(send, 429, b'{"detail":"Too many validation attempts"}', extra_headers=[(b"retry-after", b"60")])
                return
        elif path.startswith("/api/"):
            rate_id = license_key or f"{client_id}:{device_id}"
            if not self._rate_allowed(f"api:{rate_id}", limit=600, window_seconds=60):
                await self._send_json(send, 429, b'{"detail":"API rate limit exceeded"}', extra_headers=[(b"retry-after", b"60")])
                return

        try:
            max_concurrent = max(1, int(os.getenv("YMGA_MAX_CONCURRENT_REQUESTS", "64") or "64"))
        except ValueError:
            max_concurrent = 64
        with self._capacity_lock:
            if self._active_requests >= max_concurrent and path != "/health":
                at_capacity = True
            else:
                self._active_requests += 1
                at_capacity = False
        if at_capacity:
            await self._send_json(send, 503, b'{"detail":"Server is at request capacity"}', extra_headers=[(b"retry-after", b"5")])
            return

        upload_bucket = get_upload_bucket()
        download_bucket = get_download_bucket()
        started = time.perf_counter()
        status_holder = {"status": 0}
        received_bytes = 0

        class RequestBodyTooLarge(Exception):
            pass

        async def throttled_receive():
            nonlocal received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                body = message.get("body")
                if body:
                    received_bytes += len(body)
                    if received_bytes > max_request_bytes():
                        raise RequestBodyTooLarge
                    await upload_bucket.consume(len(body))
            return message

        async def throttled_send(message):
            if message.get("type") == "http.response.start":
                status_holder["status"] = int(message.get("status") or 0)
                response_headers = list(message.get("headers") or [])
                existing = {key.lower() for key, _ in response_headers}

                def add_header(name: bytes, value: bytes) -> None:
                    if name.lower() not in existing:
                        response_headers.append((name, value))
                        existing.add(name.lower())

                add_header(b"x-content-type-options", b"nosniff")
                add_header(b"x-frame-options", b"DENY")
                add_header(b"referrer-policy", b"no-referrer")
                add_header(b"permissions-policy", b"camera=(), microphone=(), geolocation=()")
                add_header(b"cross-origin-opener-policy", b"same-origin")
                if path.startswith("/api/") or path.startswith("/admin") or path == "/":
                    add_header(b"cache-control", b"no-store")
                forwarded_proto = headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
                if scope.get("scheme") == "https" or forwarded_proto == "https":
                    add_header(b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                if path.startswith("/admin") or path == "/":
                    add_header(
                        b"content-security-policy",
                        b"default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; "
                        b"img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; "
                        b"style-src 'self' 'unsafe-inline'",
                    )
                message["headers"] = response_headers
            elif message.get("type") == "http.response.body":
                body = message.get("body")
                if body:
                    await download_bucket.consume(len(body))
            await send(message)

        try:
            await self.app(scope, throttled_receive, throttled_send)
        except RequestBodyTooLarge:
            if status_holder["status"]:
                raise
            status_holder["status"] = 413
            await self._send_json(send, 413, b'{"detail":"Request body exceeds the configured upload limit"}')
        finally:
            with self._capacity_lock:
                self._active_requests = max(0, self._active_requests - 1)
            duration_ms = (time.perf_counter() - started) * 1000
            metrics_service.record_request(status=status_holder["status"] or 500, duration_ms=duration_ms)


@app.exception_handler(InvalidWorkspaceId)
async def invalid_workspace_id_handler(request: Request, exc: InvalidWorkspaceId):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(InvalidWorkspacePath)
async def invalid_workspace_path_handler(request: Request, exc: InvalidWorkspacePath):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(UploadTooLarge)
async def upload_too_large_handler(request: Request, exc: UploadTooLarge):
    return JSONResponse(status_code=413, content={"detail": str(exc)})


@app.exception_handler(UnsafeUpload)
async def unsafe_upload_handler(request: Request, exc: UnsafeUpload):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts or ["127.0.0.1", "localhost"])
app.add_middleware(TrafficMiddleware)

app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(mapping.router, prefix="/api/mapping", tags=["mapping"])
app.include_router(generation.router, prefix="/api/generation", tags=["generation"])
app.include_router(fonts.router, prefix="/api/fonts", tags=["fonts"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(licensing.router, tags=["licensing"])
app.include_router(admin_settings.router, tags=["admin"])
app.include_router(admin_dashboard.router, tags=["admin"])
app.include_router(admin_usage.router, tags=["admin"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
