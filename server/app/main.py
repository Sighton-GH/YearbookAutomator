from contextlib import asynccontextmanager
import logging
import time
import os
from threading import Event, Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from fastapi.responses import HTMLResponse

from app.routes import templates, mapping, generation, fonts
from app.routes import workspaces
from app.routes import licensing
from app.routes import admin_settings
from app.services.workspace_cleanup import cleanup_loop
from app.services.storage import InvalidWorkspaceId, clear_all_workspaces
from app.services.licensing import (
    get_device_id_from_headers,
    get_required_license_key_from_headers,
    validate_license,
)
from app.routes.licensing import (
    _encode_admin_session,
    admin_basic_auth_valid,
    clear_admin_session_cookie,
    get_admin_session_state,
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
    try:
        yield
    finally:
        stop_event.set()
        thread.join(timeout=1.0)


app = FastAPI(title="Yearbook Mugshot Automator", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        # NOTE: Some endpoints (e.g. image previews) are fetched via <img src>
        # which cannot send custom headers. Allow passing license info via query params.
        qp = request.query_params
        key = (
            get_required_license_key_from_headers(request.headers)
            or qp.get("license_key")
            or qp.get("license")
            or qp.get("key")
        )
        device_id = get_device_id_from_headers(request.headers) or qp.get("device_id")
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

        # Expose validated license context for downstream handlers.
        request.state.license_key = key
        request.state.license_device_id = device_id
        request.state.license_meta = meta
        request.state.client_session_id = (
            request.headers.get("x-client-session-id")
            or request.headers.get("X-Client-Session-Id")
            or qp.get("client_session_id")
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

    is_valid, reason, refreshed_token = get_admin_session_state(request)
    if not is_valid:
        if admin_basic_auth_valid(request):
            response = await call_next(request)
            token = _encode_admin_session(iat=int(time.time()), lat=int(time.time()))
            set_admin_session_cookie(response, token, secure=(request.url.scheme == "https"))
            return response

        status_msg = "Admin authentication required"
        if reason == "idle":
            status_msg = "Admin session expired due to inactivity"
        elif reason == "max_age":
            status_msg = "Admin session expired"
        elif reason == "invalid":
            status_msg = "Invalid admin session"

        resp = HTMLResponse(
            content=status_msg,
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="YMGA Admin", charset="UTF-8"'},
        )
        clear_admin_session_cookie(resp)
        return resp

    response = await call_next(request)
    if refreshed_token:
        set_admin_session_cookie(response, refreshed_token, secure=(request.url.scheme == "https"))
    return response


@app.exception_handler(InvalidWorkspaceId)
async def invalid_workspace_id_handler(request: Request, exc: InvalidWorkspaceId):
    return JSONResponse(status_code=400, content={"detail": str(exc)})

app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(mapping.router, prefix="/api/mapping", tags=["mapping"])
app.include_router(generation.router, prefix="/api/generation", tags=["generation"])
app.include_router(fonts.router, prefix="/api/fonts", tags=["fonts"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(licensing.router, tags=["licensing"])
app.include_router(admin_settings.router, tags=["admin"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
