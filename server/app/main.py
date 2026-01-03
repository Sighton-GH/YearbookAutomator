from contextlib import asynccontextmanager
import os
from threading import Event, Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.routes import templates, mapping, generation, fonts
from app.routes import workspaces
from app.routes import licensing
from app.services.workspace_cleanup import cleanup_loop
from app.services.storage import InvalidWorkspaceId, clear_all_workspaces
from app.services.licensing import (
    get_device_id_from_headers,
    get_required_license_key_from_headers,
    validate_and_record_use,
)
from app.services.licensing_usage import append_usage_event


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Local/dev convenience: wipe uploaded data on server start.
    # Set YMGA_CLEAR_WORKSPACES_ON_STARTUP=false to preserve workspaces.
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
async def license_guard(request: Request, call_next):
    # Allow CORS preflights.
    if request.method.upper() == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    # Allow licensing endpoints, admin panel, and health/docs.
    if (
        path.startswith("/api/licensing")
        or path.startswith("/admin/licenses")
        or path in {"/health", "/docs", "/openapi.json", "/redoc"}
    ):
        return await call_next(request)

    if path.startswith(_LICENSE_PROTECTED_PREFIXES):
        key = get_required_license_key_from_headers(request.headers)
        device_id = get_device_id_from_headers(request.headers)
        forwarded = request.headers.get("x-forwarded-for")
        ip = (forwarded.split(",")[0].strip() if forwarded else None) or (request.client.host if request.client else None)

        ok, meta = validate_and_record_use(key or "", ip=ip, device_id=device_id)
        if not ok:
            return JSONResponse(status_code=401, content={"detail": "License key required", "reason": meta.get("reason")})

        append_usage_event(
            key=(key or "").strip().upper(),
            license_type=str(meta.get("license_type") or ""),
            ip=ip,
            device_id=device_id,
            route=path,
        )

    return await call_next(request)


@app.exception_handler(InvalidWorkspaceId)
async def invalid_workspace_id_handler(request: Request, exc: InvalidWorkspaceId):
    return JSONResponse(status_code=400, content={"detail": str(exc)})

app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(mapping.router, prefix="/api/mapping", tags=["mapping"])
app.include_router(generation.router, prefix="/api/generation", tags=["generation"])
app.include_router(fonts.router, prefix="/api/fonts", tags=["fonts"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(licensing.router, tags=["licensing"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
