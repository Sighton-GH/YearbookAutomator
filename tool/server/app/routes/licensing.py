import calendar
import base64
import hashlib
import hmac
import json
import math
import os
import time
from html import escape
from secrets import compare_digest, token_hex
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Form, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.services import licensing
from app.services import licensing_usage
from app.services.admin_settings import get_face_detection_settings
from app.routes.admin_ui import (
    admin_layout as _admin_layout,
    audit_event_badge,
    badge,
    fmt_bytes,
    fmt_duration,
    fmt_relative,
    stat_card,
    meter,
)


router = APIRouter()


_ADMIN_COOKIE_NAME = "ymga_admin_session"
_LICENSE_COOKIE_NAME = "ymga_license_session"
_LICENSE_DEVICE_COOKIE_NAME = "ymga_license_device"
_RUNTIME_ADMIN_SESSION_SECRET = token_hex(32)


def _admin_expected_username() -> str:
  from_env = str(os.getenv("YMGA_LICENSE_ADMIN_USERNAME", "") or "").strip()
  if from_env:
    return from_env
  settings = get_face_detection_settings()
  configured = str(getattr(settings, "admin_username", "") or "").strip()
  if configured:
    return configured
  return (os.getenv("YMGA_LICENSE_ADMIN_USERNAME", "sighton_admin") or "sighton_admin").strip() or "sighton_admin"


def _admin_expected_password() -> str:
  return os.getenv("YMGA_LICENSE_ADMIN_PASSWORD", "").strip()


def _admin_password_is_configured() -> bool:
    password = _admin_expected_password()
    return len(password) >= 14 and password != "Sighton!2026"


def request_is_secure(request: Request) -> bool:
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip().lower()
    return request.url.scheme == "https" or forwarded_proto == "https"


def get_license_session_credentials(request: Request) -> tuple[str | None, str | None]:
    key = (request.cookies.get(_LICENSE_COOKIE_NAME) or "").strip().upper()
    device_id = (request.cookies.get(_LICENSE_DEVICE_COOKIE_NAME) or "").strip()
    return (key or None, device_id or None)


def set_license_session_cookies(response: Response, *, key: str, device_id: str, secure: bool) -> None:
    cookie_options = {
        "max_age": 8 * 60 * 60,
        "httponly": True,
        "samesite": "strict",
        "secure": secure,
        "path": "/api",
    }
    response.set_cookie(_LICENSE_COOKIE_NAME, key.strip().upper(), **cookie_options)
    response.set_cookie(_LICENSE_DEVICE_COOKIE_NAME, device_id.strip(), **cookie_options)


def clear_license_session_cookies(response: Response) -> None:
    response.delete_cookie(_LICENSE_COOKIE_NAME, path="/api")
    response.delete_cookie(_LICENSE_DEVICE_COOKIE_NAME, path="/api")


def _admin_session_secret_bytes() -> bytes:
    configured = (
        os.getenv("YMGA_ADMIN_SESSION_SECRET", "").strip()
        or os.getenv("YMGA_LICENSE_SECRET", "").strip()
        or _RUNTIME_ADMIN_SESSION_SECRET
    )
    return configured.encode("utf-8")


def _admin_timeouts() -> tuple[int, int]:
    settings = get_face_detection_settings()
    idle = max(60, int(settings.admin_idle_timeout_seconds))
    max_age = max(idle, int(settings.admin_max_session_seconds))
    return (idle, max_age)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    padded = text + ("=" * ((4 - (len(text) % 4)) % 4))
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _sign_admin_payload(payload_b64: str) -> str:
    digest = hmac.new(_admin_session_secret_bytes(), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def _encode_admin_session(iat: int, lat: int) -> str:
    payload = {"v": 1, "iat": int(iat), "lat": int(lat)}
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign_admin_payload(payload_b64)}"


def _decode_admin_session(token: str) -> dict | None:
    try:
        payload_b64, sig = token.split(".", 1)
    except ValueError:
        return None
    if not payload_b64 or not sig:
        return None
    expected = _sign_admin_payload(payload_b64)
    if not compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("v") != 1:
        return None
    iat = payload.get("iat")
    lat = payload.get("lat")
    if not isinstance(iat, int) or not isinstance(lat, int):
        return None
    return payload


def get_admin_session_state(request: Request) -> tuple[bool, str | None, str | None]:
    if not _admin_password_is_configured():
        return (False, "not_configured", None)

    token = (request.cookies.get(_ADMIN_COOKIE_NAME) or "").strip()
    if not token:
        return (False, "missing", None)

    payload = _decode_admin_session(token)
    if not payload:
        return (False, "invalid", None)

    now = int(time.time())
    iat = int(payload["iat"])
    lat = int(payload["lat"])
    if now < iat or now < lat:
        return (False, "invalid", None)

    idle_timeout, max_timeout = _admin_timeouts()
    if now - iat > max_timeout:
        return (False, "max_age", None)
    if now - lat > idle_timeout:
        return (False, "idle", None)

    refreshed = _encode_admin_session(iat=iat, lat=now)
    return (True, None, refreshed)


def set_admin_session_cookie(response: HTMLResponse | RedirectResponse, token: str, *, secure: bool) -> None:
    _, max_timeout = _admin_timeouts()
    response.set_cookie(
        key=_ADMIN_COOKIE_NAME,
        value=token,
        max_age=max_timeout,
        httponly=True,
        samesite="strict",
        secure=secure,
        path="/",
    )


def clear_admin_session_cookie(response: HTMLResponse | RedirectResponse) -> None:
  response.delete_cookie(_ADMIN_COOKIE_NAME, path="/")


def _safe_admin_next(next_path: str) -> str:
  candidate = str(next_path or "").strip()
  if candidate == "/" or candidate.startswith("/admin/"):
    return candidate
  return "/admin/licenses"


def _login_redirect_url(next_path: str = "/admin/licenses", reason: str | None = None) -> str:
  safe_next = _safe_admin_next(next_path)
  qp = f"next={quote(safe_next, safe='')}"
  if reason:
    qp += f"&reason={quote(reason, safe='')}"
  return f"/admin/login?{qp}"


def admin_basic_auth_valid(request: Request) -> bool:
    if not _admin_password_is_configured():
      return False
    auth = (request.headers.get("authorization") or "").strip()
    if not auth.lower().startswith("basic "):
      return False
    encoded = auth[6:].strip()
    if not encoded:
      return False
    try:
      decoded = base64.b64decode(encoded).decode("utf-8")
    except Exception:
      return False
    if ":" not in decoded:
      return False
    username, password = decoded.split(":", 1)
    expected_user = _admin_expected_username()
    expected_password = _admin_expected_password()
    user_ok = compare_digest((username or "").strip(), expected_user)
    password_ok = compare_digest((password or "").strip(), expected_password)
    return bool(user_ok and password_ok)


@router.get("/", response_class=HTMLResponse)
def home(request: Request):
    from app.services import admin_dashboard as dash

    has_pw = _admin_password_is_configured()
    admin_username = _admin_expected_username()
    snap = dash.get_dashboard_snapshot()

    warning = "" if has_pw else (
        "<div class='card warn'><strong>Admin password is not configured.</strong> "
        "Set <code>YMGA_LICENSE_ADMIN_PASSWORD</code> and restart the backend.</div>"
    )

    lic = snap["license_summary"]
    usage = snap["usage_summary"]
    sysinfo = snap["system"]
    gpu = snap["gpu"]
    met = snap["metrics"]
    pool = snap["rembg_pool"]

    stat_cards = "".join(
        [
            stat_card(
                "Active sessions",
                str(snap["active_session_count"]),
                sub=f"{snap['stale_session_count']} stale/orphaned",
            ),
            stat_card("Commercial locks", str(len(snap["active_locks"]))),
            stat_card(
                "Licenses issued",
                str(lic["total"]),
                sub=f"{lic['personal']} personal · {lic['commercial']} commercial",
            ),
            stat_card("Uses today", str(usage["uses_today"]), sub=f"{usage['uses_this_month']} this month"),
            stat_card(
                "Requests / min",
                f"{met['requests_per_minute']:.1f}",
                sub=f"{met['total_requests']} total · uptime {fmt_duration(met['uptime_seconds'])}",
            ),
            stat_card("Workspace disk usage", fmt_bytes(snap["disk_total_bytes"])),
        ]
    )

    cpu_pct = sysinfo.get("cpu_percent")
    mem = sysinfo.get("memory") or {}
    disk = sysinfo.get("disk") or {}

    if sysinfo.get("psutil_available"):
        resource_html = f"""
          <div class='row'>
            <div>
              <div class='hint'>CPU — {(f"{cpu_pct:.0f}%" if cpu_pct is not None else "n/a")} across {sysinfo.get('cpu_count_logical') or '?'} logical cores</div>
              {meter(cpu_pct or 0)}
            </div>
            <div>
              <div class='hint'>Memory — {fmt_bytes(mem.get('used_bytes'))} / {fmt_bytes(mem.get('total_bytes'))}</div>
              {meter(mem.get('percent') or 0)}
            </div>
            <div>
              <div class='hint'>Disk (data dir) — {fmt_bytes(disk.get('used_bytes'))} / {fmt_bytes(disk.get('total_bytes'))}</div>
              {meter(disk.get('percent') or 0)}
            </div>
          </div>
        """
    else:
        resource_html = "<p class='muted'>Install <code>psutil</code> on the server for live CPU/memory stats.</p>"

    gpu_lines: list[str] = []
    for g in gpu.get("gpus") or []:
        used = float(g.get("memory_used_mb") or 0) * 1024 * 1024
        total = float(g.get("memory_total_mb") or 0) * 1024 * 1024
        gpu_lines.append(
            "<div>"
            f"<div class='hint'>{escape(str(g.get('name') or 'GPU'))} — {g.get('utilization_percent', 0):.0f}% util · "
            f"{fmt_bytes(used)} / {fmt_bytes(total)} · {g.get('temperature_c', 0):.0f}\u00b0C</div>"
            f"{meter(g.get('utilization_percent') or 0)}"
            "</div>"
        )
    gpu_html = "".join(gpu_lines) if gpu_lines else "<p class='muted'>No live GPU telemetry (nvidia-smi not detected).</p>"

    providers = gpu.get("onnx_providers") or []
    providers_html = "".join(
        badge(p, "info" if p != "CPUExecutionProvider" else "muted") for p in providers
    ) or "<span class='muted'>none detected</span>"

    pool_html = (
        f"ML background-removal pool: <strong>{pool.get('idle', 0)} idle</strong> / "
        f"<strong>{pool.get('created', 0)} created</strong> (max {pool.get('max') or 'auto'})"
        if pool.get("created") is not None
        else "ML background-removal pool: not started yet"
    )

    recent = licensing_usage.get_recent_usage(limit=8)
    recent_rows = "".join(
        "<tr>"
        f"<td>{fmt_relative(ev.get('ts'))}</td>"
        f"<td><code>{escape(str(ev.get('key', '') or '')[:18])}…</code></td>"
        f"<td>{badge(str(ev.get('license_type', '') or ''), 'info')}</td>"
        f"<td>{escape(str(ev.get('route', '') or ''))}</td>"
        "</tr>"
        for ev in recent
    ) or "<tr><td colspan='4' class='empty-state'>No usage recorded yet</td></tr>"

    recent_audit = snap["recent_audit"]
    audit_rows = "".join(
        "<tr>"
        f"<td>{fmt_relative(ev.get('ts'))}</td>"
        f"<td>{audit_event_badge(str(ev.get('event') or ''))}</td>"
        f"<td><code>{escape(str(ev.get('workspace_id') or '—')[:14])}</code></td>"
        f"<td>{escape(str(ev.get('detail') or '—'))}</td>"
        "</tr>"
        for ev in recent_audit
    ) or "<tr><td colspan='4' class='empty-state'>No audit events recorded yet</td></tr>"

    content = f"""
  <h1 class="page-title">Dashboard</h1>
  <p class="subtitle">Signed in as <code>{escape(admin_username)}</code> · live overview of licensing, sessions, and system resources.</p>
  {warning}

  <div class="stat-grid">{stat_cards}</div>

  <div class="row">
    <div class="card">
      <h2>System resources</h2>
      {resource_html}
      <h3>GPU</h3>
      <div class="hint" style="margin-bottom:8px;">ONNX Runtime providers: {providers_html}</div>
      {gpu_html}
      <div class="hint" style="margin-top:10px;">{pool_html}</div>
    </div>
    <div class="card">
      <h2>Recent activity</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>when</th><th>key</th><th>type</th><th>route</th></tr></thead>
          <tbody>{recent_rows}</tbody>
        </table>
      </div>
      <div class="hint" style="margin-top:8px;"><a href="/admin/licenses">View full usage log →</a></div>
    </div>
    <div class="card">
      <h2>Recent workspace events</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>when</th><th>event</th><th>workspace</th><th>detail</th></tr></thead>
          <tbody>{audit_rows}</tbody>
        </table>
      </div>
      <div class="hint" style="margin-top:8px;"><a href="/admin/audit">View full audit log →</a></div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3 style="margin-top:0">Usage</h3>
      <p class="muted">Live CPU/RAM/GPU trends, request traffic, and tool/license usage over time.</p>
      <a class="btn primary" href="/admin/usage">Open</a>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Sessions</h3>
      <p class="muted">Inspect and manage active tool workspaces, checkout locks, and disk usage.</p>
      <a class="btn" href="/admin/sessions">Open</a>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Licenses</h3>
      <p class="muted">Create, revoke, and inspect license usage.</p>
      <a class="btn" href="/admin/licenses">Open</a>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Settings</h3>
      <p class="muted">Generation controls, face detection, and performance/resource limits.</p>
      <a class="btn" href="/admin/settings">Open</a>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Health check</h3>
      <p class="muted">Confirm backend status (JSON).</p>
      <a class="btn" href="/health">Open</a>
    </div>
  </div>
"""
    return HTMLResponse(content=_admin_layout(title="YMGA Admin Dashboard", active="dashboard", content=content), status_code=200)


@router.get("/admin", response_class=HTMLResponse)
def admin_root():
    return RedirectResponse(url="/", status_code=303)


@router.get("/admin/login", response_class=HTMLResponse)
def admin_login_page(request: Request, next: str = "/admin/licenses", reason: str = ""):
  safe_next = _safe_admin_next(next)
  return RedirectResponse(url=safe_next, status_code=303)


@router.post("/admin/login")
def admin_login(request: Request, username: str = Form(""), password: str = Form(""), next: str = Form("/admin/licenses")):
  safe_next = _safe_admin_next(next)
  if not _admin_password_is_configured():
    return RedirectResponse(url=_login_redirect_url(safe_next, reason="not_configured"), status_code=303)
  expected_user = _admin_expected_username()
  expected = _admin_expected_password()
  user_ok = compare_digest((username or "").strip(), expected_user)
  password_ok = compare_digest((password or "").strip(), expected)
  if not (user_ok and password_ok):
    return RedirectResponse(url=_login_redirect_url(safe_next, reason="invalid"), status_code=303)

  token = _encode_admin_session(iat=int(time.time()), lat=int(time.time()))
  resp = RedirectResponse(url=safe_next, status_code=303)
  set_admin_session_cookie(resp, token, secure=request_is_secure(request))
  return resp


@router.post("/admin/logout")
def admin_logout():
    resp = RedirectResponse(url=_login_redirect_url("/admin/licenses", reason="logout"), status_code=303)
    clear_admin_session_cookie(resp)
    return resp


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    if request.client:
        return request.client.host
    return None


def _epoch_to_dt_local(ts: int | None) -> str:
    """Format an epoch timestamp for an <input type=datetime-local> value, in server-local time."""

    if not ts:
        return ""
    return time.strftime("%Y-%m-%dT%H:%M", time.localtime(int(ts)))


def _dt_local_to_epoch(value: str) -> int | None:
    """Parse an <input type=datetime-local> value (server-local time) back to epoch seconds."""

    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = time.strptime(value, "%Y-%m-%dT%H:%M")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date/time value")
    return int(time.mktime(parsed))


def _license_status(rec, now_ts: int) -> str:
    if rec.revoked:
        return "revoked"
    if rec.expires_at is not None and int(rec.expires_at) < now_ts:
        return "expired"
    return "active"


def _license_matches_query(rec, q: str) -> bool:
    if not q:
        return True
    haystack = " ".join(
        str(v) for v in [
            rec.key or "",
            rec.note or "",
            rec.bound_ip or "",
            rec.bound_device_id or "",
            rec.last_seen_ip or "",
            rec.last_seen_device_id or "",
        ]
    ).lower()
    return q in haystack


def _next_month_reset_utc(now_ts: int) -> int:
    t = time.gmtime(now_ts)
    year = t.tm_year
    month = t.tm_mon
    if month >= 12:
        year += 1
        month = 1
    else:
        month += 1
    return calendar.timegm((year, month, 1, 0, 0, 0, 0, 0, 0))


class LicenseValidateRequest(BaseModel):
    key: str


class LicenseValidateResponse(BaseModel):
    valid: bool
    license_type: Literal["personal", "commercial"] | None = None
    expires_at: int | None = None
    unlock_all_steps: bool = False
    reason: str | None = None


@router.post("/api/licensing/validate", response_model=LicenseValidateResponse)
def validate_license(req: LicenseValidateRequest, request: Request, response: Response):
    ip = _client_ip(request)
    device_id = licensing.get_device_id_from_headers(request.headers)
    ok, meta = licensing.validate_license(req.key, ip=ip, device_id=device_id)
    if ok:
        set_license_session_cookies(
            response,
            key=req.key,
            device_id=device_id or "",
            secure=request_is_secure(request),
        )
        return LicenseValidateResponse(
            valid=True,
            license_type=meta.get("license_type"),
            expires_at=meta.get("expires_at"),
        unlock_all_steps=bool(meta.get("unlock_all_steps", False)),
        )
    clear_license_session_cookies(response)
    return LicenseValidateResponse(valid=False, reason=str(meta.get("reason")))


class FreeKeyRequest(BaseModel):
    accepted_non_commercial_terms: bool


class FreeKeyResponse(BaseModel):
    key: str


@router.post("/api/licensing/free-key", response_model=FreeKeyResponse)
def free_key(req: FreeKeyRequest, request: Request, response: Response):
    if not req.accepted_non_commercial_terms:
        raise HTTPException(status_code=400, detail="Must accept non-commercial terms")

    ip = _client_ip(request)
    device_id = licensing.get_device_id_from_headers(request.headers)
    if not device_id:
        raise HTTPException(status_code=400, detail="Missing device id")

    key = licensing.get_or_create_personal_license(ip=ip, device_id=device_id, note="free personal")
    set_license_session_cookies(
        response,
        key=key,
        device_id=device_id,
        secure=request_is_secure(request),
    )
    return FreeKeyResponse(key=key)


@router.get("/admin/licenses", response_class=HTMLResponse)
def admin_panel(
    request: Request,
    q: str = "",
    type: str = Query("all", alias="type"),
    status: str = Query("all", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50),
):
    admin_pw_set = _admin_password_is_configured()
    all_records = licensing.list_licenses()
    usage = licensing_usage.get_recent_usage(limit=500)

    now_ts = int(time.time())
    total_count = len(all_records)
    revoked_count = sum(1 for r in all_records if r.revoked)
    expired_count = sum(1 for r in all_records if (not r.revoked) and r.expires_at is not None and int(r.expires_at) < now_ts)
    active_count = max(0, total_count - revoked_count - expired_count)
    personal_count = sum(1 for r in all_records if r.license_type == "personal")
    commercial_count = sum(1 for r in all_records if r.license_type == "commercial")

    stat_cards = "".join(
        [
            stat_card("Total licenses", str(total_count), sub=f"{personal_count} personal · {commercial_count} commercial"),
            stat_card("Active", str(active_count), kind="ok"),
            stat_card("Revoked", str(revoked_count), kind="danger" if revoked_count else None),
            stat_card("Expired", str(expired_count), kind="warn" if expired_count else None),
            stat_card("Usage events logged", str(len(usage)), sub="last 500 shown below"),
        ]
    )

    # --- filter + search + paginate ---
    type_filter = type if type in {"personal", "commercial"} else "all"
    status_filter = status if status in {"active", "revoked", "expired"} else "all"
    q_norm = (q or "").strip().lower()

    filtered = [
        r
        for r in all_records
        if (type_filter == "all" or r.license_type == type_filter)
        and (status_filter == "all" or _license_status(r, now_ts) == status_filter)
        and _license_matches_query(r, q_norm)
    ]
    filtered.sort(key=lambda r: r.issued_at, reverse=True)
    filtered_count = len(filtered)

    allowed_page_sizes = {25, 50, 100, 250, 0}  # 0 = show all
    if page_size not in allowed_page_sizes:
        page_size = 50

    if page_size == 0:
        page = 1
        page_count = 1
        page_records = filtered
    else:
        page_count = max(1, math.ceil(filtered_count / page_size))
        page = min(max(1, page), page_count)
        start = (page - 1) * page_size
        page_records = filtered[start : start + page_size]

    def _qs(*, page_override: int | None = None, page_size_override: int | None = None) -> str:
        parts: list[str] = []
        if q_norm:
            parts.append(f"q={quote(q, safe='')}")
        if type_filter != "all":
            parts.append(f"type={quote(type_filter, safe='')}")
        if status_filter != "all":
            parts.append(f"status={quote(status_filter, safe='')}")
        eff_page_size = page_size_override if page_size_override is not None else page_size
        if eff_page_size != 50:
            parts.append(f"page_size={eff_page_size}")
        eff_page = page_override if page_override is not None else page
        if eff_page != 1:
            parts.append(f"page={eff_page}")
        return "&".join(parts)

    return_qs = escape(request.url.query)

    license_rows: list[str] = []
    dialogs: list[str] = []
    for idx, rec in enumerate(page_records):
        issued = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(rec.issued_at))
        expires_full = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(rec.expires_at)) if rec.expires_at else "No expiry"
        last_used_full = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(rec.last_used_at)) if rec.last_used_at else "Never"

        key_display = rec.key or ""
        if not key_display and rec.key_hash:
            key_display = f"(legacy hashed) {rec.key_hash[:12]}…"

        status_label = _license_status(rec, now_ts)
        status_kind = {"revoked": "danger", "expired": "warn", "active": "ok"}[status_label]

        display_ip = rec.last_seen_ip or rec.bound_ip or ""

        max_uses_display = "" if rec.max_uses is None else f"/{rec.max_uses}"
        if rec.license_type == "personal":
            monthly_limit = rec.monthly_limit or licensing.personal_monthly_limit_default()
            uses_display = f"{rec.uses} (of {monthly_limit}/mo)"
        else:
            uses_display = f"{rec.uses}{max_uses_display}"

        note_display = rec.note or ""

        dialog_id = f"lic-dialog-{idx}"
        gear_btn = ""
        dialog_html = ""
        if rec.key:
            reset_ts = _next_month_reset_utc(now_ts)
            usage_reset_display = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(reset_ts))

            unlock_desired = "0" if rec.unlock_all_steps else "1"
            unlock_btn_label = "Disable" if rec.unlock_all_steps else "Enable"

            workspace_expiry_section = ""
            if rec.license_type == "commercial":
                workspace_expiry_display = (
                    badge("disabled", "warn")
                    if rec.workspace_expiry_disabled
                    else (
                        f"{rec.workspace_expiry_seconds}s"
                        if rec.workspace_expiry_seconds
                        else f"Default ({licensing.DEFAULT_COMMERCIAL_WORKSPACE_EXPIRY_SECONDS}s)"
                    )
                )
                expiry_seconds_value = str(rec.workspace_expiry_seconds) if rec.workspace_expiry_seconds else ""
                workspace_expiry_section = f"""
                <h3 style="margin-top:0">Workspace session expiry — {workspace_expiry_display}</h3>
                <form method="post" action="/admin/licenses/set-workspace-expiry">
                  <input type="hidden" name="key" value="{escape(rec.key)}"/>
                  <input type="hidden" name="return_qs" value="{return_qs}"/>
                  <label style="display:flex; gap:6px; align-items:center; font-weight:400;">
                    <input type="checkbox" name="disabled" value="1" style="width:auto" {"checked" if rec.workspace_expiry_disabled else ""}/> Disable (never auto-delete this workspace)
                  </label>
                  <label>Custom duration (seconds)</label>
                  <input name="seconds" placeholder="e.g. 3600" value="{expiry_seconds_value}" style="width:160px"/>
                  <div style="margin-top:8px"><button type="submit" class="small">Save</button></div>
                </form>
                """

            usage_limit_field = (
                f"""
                  <label>Monthly limit (personal)</label>
                  <input name="monthly_limit" placeholder="e.g. 5" value="{'' if rec.monthly_limit is None else rec.monthly_limit}" style="width:160px"/>
                """
                if rec.license_type == "personal"
                else f"""
                  <label>Max uses (lifetime, blank = unlimited)</label>
                  <input name="max_uses" placeholder="e.g. 100" value="{'' if rec.max_uses is None else rec.max_uses}" style="width:160px"/>
                """
            )

            delete_confirm = (
                "return confirm('Permanently delete this license? This cannot be undone — usage history and bindings will be lost. "
                "Use Revoke instead if you just want to block it.')"
            )

            dialog_html = f"""
            <dialog id="{dialog_id}">
              <div class="dialog-head">
                <h2>License details</h2>
                <button type="button" class="small icon-btn" onclick="this.closest('dialog').close()">&times;</button>
              </div>
              <div class="dialog-body">
                <dl class="kv-grid">
                  <dt>Status</dt><dd>{badge(status_label, status_kind)}</dd>
                  <dt>Type</dt><dd>{badge(rec.license_type, "info" if rec.license_type == "commercial" else "muted")}</dd>
                  <dt>Key</dt><dd class="mono" style="word-break:break-all;">{escape(rec.key)}</dd>
                  <dt>Issued</dt><dd>{escape(issued)}</dd>
                  <dt>Bound IP</dt><dd>{escape(rec.bound_ip or "—")}</dd>
                  <dt>Bound device</dt><dd>{escape(rec.bound_device_id or "—")}</dd>
                  <dt>Last seen IP</dt><dd>{escape(rec.last_seen_ip or "—")}</dd>
                  <dt>Last seen device</dt><dd>{escape(rec.last_seen_device_id or "—")}</dd>
                  <dt>Last used</dt><dd>{escape(last_used_full)}</dd>
                  <dt>Usage</dt><dd>{escape(uses_display)}{" · resets " + escape(usage_reset_display) if rec.license_type == "personal" else ""}</dd>
                </dl>
                <div style="margin:10px 0 16px;">
                  <button type="button" class="small" onclick="navigator.clipboard.writeText('{escape(rec.key)}')">Copy full key</button>
                </div>

                <h3 style="margin-top:0">Edit</h3>
                <form method="post" action="/admin/licenses/update">
                  <input type="hidden" name="key" value="{escape(rec.key)}"/>
                  <input type="hidden" name="return_qs" value="{return_qs}"/>
                  <label>Note</label>
                  <input name="note" value="{escape(rec.note or '')}" placeholder="customer / invoice / etc"/>
                  <label>Expires at</label>
                  <input type="datetime-local" name="expires_at" value="{_epoch_to_dt_local(rec.expires_at)}"/>
                  {usage_limit_field}
                  <div style="margin-top:8px"><button type="submit" class="small primary">Save changes</button></div>
                </form>

                <h3 style="margin-top:0">Unlock all steps — currently {"on" if rec.unlock_all_steps else "off"}</h3>
                <form method="post" action="/admin/licenses/set-unlock-all">
                  <input type="hidden" name="key" value="{escape(rec.key)}"/>
                  <input type="hidden" name="enabled" value="{unlock_desired}"/>
                  <input type="hidden" name="return_qs" value="{return_qs}"/>
                  <button type="submit" class="small">{escape(unlock_btn_label)}</button>
                </form>

                {workspace_expiry_section}

                <h3 style="margin-top:0">Danger zone</h3>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  {"" if rec.revoked else f'''
                  <form method="post" action="/admin/licenses/revoke" onsubmit="return confirm('Revoke this license? It will immediately stop working, but its history is kept.')">
                    <input type="hidden" name="key" value="{escape(rec.key)}"/>
                    <input type="hidden" name="return_qs" value="{return_qs}"/>
                    <button type="submit" class="small danger">Revoke</button>
                  </form>
                  '''}
                  <form method="post" action="/admin/licenses/delete" onsubmit="{delete_confirm}">
                    <input type="hidden" name="key" value="{escape(rec.key)}"/>
                    <input type="hidden" name="return_qs" value="{return_qs}"/>
                    <button type="submit" class="small danger">Delete permanently</button>
                  </form>
                </div>
              </div>
            </dialog>
            """
            gear_btn = f"<button type=\"button\" class=\"small icon-btn\" title=\"Settings\" onclick=\"document.getElementById('{dialog_id}').showModal()\">&#9881;</button>"
            dialogs.append(dialog_html)

        license_rows.append(
            "<tr>"
            f"<td>{badge(status_label, status_kind)}</td>"
            f"<td>{badge(rec.license_type, 'info' if rec.license_type == 'commercial' else 'muted')}</td>"
            f"<td class=\"truncate\" title=\"{escape(key_display)}\"><code>{escape(key_display)}</code></td>"
            f"<td class=\"truncate\" title=\"{escape(display_ip)}\">{escape(display_ip) or '—'}</td>"
            f"<td>{escape(uses_display)}</td>"
            f"<td title=\"{escape(last_used_full)}\">{escape(fmt_relative(rec.last_used_at))}</td>"
            f"<td title=\"{escape(expires_full)}\">{escape(expires_full) if rec.expires_at else '—'}</td>"
            f"<td class=\"truncate\" title=\"{escape(note_display)}\">{escape(note_display) or '—'}</td>"
            f"<td>{gear_btn}</td>"
            "</tr>"
        )

    usage_rows: list[str] = []
    for ev in usage:
        ts = int(ev.get("ts", 0) or 0)
        when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)) if ts else ""
        usage_rows.append(
            "<tr>"
            f"<td>{escape(when)}</td>"
            f"<td><code>{escape(str(ev.get('key', '') or ''))}</code></td>"
            f"<td>{badge(str(ev.get('license_type', '') or ''), 'info')}</td>"
            f"<td>{escape(str(ev.get('ip', '') or ''))}</td>"
            f"<td>{escape(str(ev.get('device_id', '') or ''))}</td>"
            f"<td>{escape(str(ev.get('route', '') or ''))}</td>"
            "</tr>"
        )

    warning = "" if admin_pw_set else (
        "<div class='card warn'>"
        "<strong>Warning:</strong> Admin access is disabled because no strong password is configured."
        "<div style='margin-top:8px'>To enable protection, set the environment variable "
        "<code>YMGA_LICENSE_ADMIN_PASSWORD</code> to at least 14 characters and restart the backend.</div>"
        "</div>"
    )

    def _opt(value: str, label: str, current: str) -> str:
        return f"<option value='{value}' {'selected' if value == current else ''}>{escape(label)}</option>"

    filter_bar = f"""
    <form method="get" action="/admin/licenses" class="filter-bar">
      <div class="field">
        <label>Search</label>
        <input name="q" value="{escape(q)}" placeholder="key, note, ip, device id…"/>
      </div>
      <div class="field">
        <label>Type</label>
        <select name="type">
          {_opt('all', 'All types', type_filter)}
          {_opt('personal', 'Personal', type_filter)}
          {_opt('commercial', 'Commercial', type_filter)}
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select name="status">
          {_opt('all', 'All statuses', status_filter)}
          {_opt('active', 'Active', status_filter)}
          {_opt('revoked', 'Revoked', status_filter)}
          {_opt('expired', 'Expired', status_filter)}
        </select>
      </div>
      <div class="field">
        <label>Per page</label>
        <select name="page_size">
          {_opt('25', '25', str(page_size))}
          {_opt('50', '50', str(page_size))}
          {_opt('100', '100', str(page_size))}
          {_opt('250', '250', str(page_size))}
          {_opt('0', 'All', str(page_size))}
        </select>
      </div>
      <div class="field">
        <button type="submit">Apply</button>
      </div>
      {f'<div class="field"><a class="btn" href="/admin/licenses">Clear</a></div>' if (q or type_filter != 'all' or status_filter != 'all' or page_size != 50) else ''}
    </form>
    """

    prev_link = (
        f"<a class='btn small' href='/admin/licenses?{_qs(page_override=page - 1)}'>&larr; Prev</a>"
        if page > 1
        else "<a class='btn small disabled' href='#'>&larr; Prev</a>"
    )
    next_link = (
        f"<a class='btn small' href='/admin/licenses?{_qs(page_override=page + 1)}'>Next &rarr;</a>"
        if page < page_count
        else "<a class='btn small disabled' href='#'>Next &rarr;</a>"
    )
    pager = f"""
    <div class="pager">
      <div>Showing {len(page_records)} of {filtered_count} license(s){' (filtered from ' + str(total_count) + ')' if filtered_count != total_count else ''}</div>
      <div class="pager-links">{prev_link}<span>Page {page} of {page_count}</span>{next_link}</div>
    </div>
    """

    content = f"""
  <h1 class="page-title">Licenses</h1>
  <p class="subtitle">Create, revoke, delete, and inspect license usage.</p>

  {warning}

  <div class="stat-grid">{stat_cards}</div>

  <div class="row">
    <div class="card">
      <h2>Create license key</h2>
      <form method="post" action="/admin/licenses/create">
        <label>Type</label>
        <select name="license_type">
          <option value="commercial">commercial</option>
          <option value="personal">personal</option>
        </select>
        <label>Expires at (optional)</label>
        <input type="datetime-local" name="expires_at" />
        <label>Max uses (optional)</label>
        <input name="max_uses" placeholder="e.g. 100" />
        <label>Note (optional)</label>
        <input name="note" placeholder="customer / invoice / etc" />
        <label style="display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;">
          <input type="checkbox" name="unlock_all_steps" value="1" style="width:auto" />
          Unlock all steps (bypass step gating)
        </label>
        <label>Custom workspace expiry (seconds, optional &mdash; commercial only)</label>
        <input name="workspace_expiry_seconds" placeholder="e.g. 3600 = 1 hour, 86400 = 1 day" />
        <label style="display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;">
          <input type="checkbox" name="workspace_expiry_disabled" value="1" style="width:auto" />
          Disable workspace expiry (commercial only &mdash; never auto-delete this workspace)
        </label>
        <div style="margin-top: 10px;">
          <button type="submit" class="primary">Create</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>Revoke license key</h2>
      <form method="post" action="/admin/licenses/revoke">
        <label>License key (full)</label>
        <input name="key" placeholder="YMGA1-..." />
        <div style="margin-top: 10px;">
          <button type="submit" class="danger">Revoke</button>
        </div>
      </form>
      <p class="hint">Handy when you have a key pasted from elsewhere (e.g. a support ticket) without browsing the table below.</p>
    </div>
  </div>

  <div class="card">
    <div class="toolbar">
      <h2 style="margin:0">Licenses</h2>
    </div>
    {filter_bar}
    <div class="table-wrap">
      <table class="licenses-table">
        <colgroup>
          <col style="width:78px"/>
          <col style="width:88px"/>
          <col style="width:180px"/>
          <col style="width:110px"/>
          <col style="width:110px"/>
          <col style="width:100px"/>
          <col style="width:140px"/>
          <col/>
          <col style="width:44px"/>
        </colgroup>
        <thead>
          <tr>
            <th>status</th>
            <th>type</th>
            <th>key</th>
            <th>ip</th>
            <th>uses</th>
            <th>last used</th>
            <th>expires</th>
            <th>note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {"".join(license_rows) if license_rows else "<tr><td colspan='9' class='empty-state'>No licenses match the current filters</td></tr>"}
        </tbody>
      </table>
    </div>
    {pager}
  </div>
  {"".join(dialogs)}

  <div class="card">
    <h2>Recent usage (last 500)</h2>
    <p class="hint">Browsers cannot provide a real MAC address; this logs a per-browser device id instead.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>time</th>
            <th>key</th>
            <th>type</th>
            <th>ip</th>
            <th>device id</th>
            <th>route</th>
          </tr>
        </thead>
        <tbody>
          {"".join(usage_rows) if usage_rows else "<tr><td colspan='6' class='empty-state'>No usage yet</td></tr>"}
        </tbody>
      </table>
    </div>
  </div>
"""

    return HTMLResponse(content=_admin_layout(title="YMGA License Admin", active="licenses", content=content), status_code=200)


@router.post("/admin/licenses/create")
def admin_create(
    license_type: Literal["personal", "commercial"] = Form(...),
    expires_at: str = Form(""),
    max_uses: str = Form(""),
    note: str = Form(""),
    unlock_all_steps: str = Form(""),
    workspace_expiry_seconds: str = Form(""),
    workspace_expiry_disabled: str = Form(""),
):
    exp = _dt_local_to_epoch(expires_at)

    maxu: int | None = None
    max_uses = (max_uses or "").strip()
    if max_uses:
        try:
            maxu = int(max_uses)
            if maxu <= 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="max_uses must be a positive integer")

    workspace_ttl: int | None = None
    workspace_expiry_seconds = (workspace_expiry_seconds or "").strip()
    if workspace_expiry_seconds:
        try:
            workspace_ttl = int(workspace_expiry_seconds)
            if workspace_ttl <= 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="workspace_expiry_seconds must be a positive integer")

    key = licensing.create_license(
        license_type=license_type,
        expires_at=exp,
        max_uses=maxu,
        note=(note or "").strip() or None,
        unlock_all_steps=bool((unlock_all_steps or "").strip()),
        workspace_expiry_disabled=bool((workspace_expiry_disabled or "").strip()),
        workspace_expiry_seconds=workspace_ttl,
    )

    return HTMLResponse(
      content=_admin_layout(
        title="License Created",
        active="licenses",
        content=(
          "<h1 class=\"page-title\">License key created</h1>"
          "<div class='card success'><strong>Copy this key now.</strong> It will not be shown in full again outside this admin panel's license table.</div>"
          f"<pre class=\"mono\" style='padding: 12px; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--surface-2); font-size: 14px; overflow-x:auto;'>{escape(key)}</pre>"
          "<p><a class=\"btn primary\" href='/admin/licenses'>Back to admin</a></p>"
        ),
      ),
      status_code=200,
    )


def _redirect_back(return_qs: str) -> RedirectResponse:
    qs = (return_qs or "").strip()
    url = f"/admin/licenses?{qs}" if qs else "/admin/licenses"
    return RedirectResponse(url=url, status_code=303)


@router.post("/admin/licenses/revoke")
def admin_revoke(
    key: str = Form(...),
    return_qs: str = Form(""),
):
    licensing.revoke_license(key)
    return _redirect_back(return_qs)


@router.post("/admin/licenses/delete")
def admin_delete(
    key: str = Form(...),
    return_qs: str = Form(""),
):
    licensing.delete_license(key)
    return _redirect_back(return_qs)


@router.post("/admin/licenses/update")
def admin_update(
    key: str = Form(...),
    note: str = Form(""),
    expires_at: str = Form(""),
    max_uses: str = Form(""),
    monthly_limit: str = Form(""),
    return_qs: str = Form(""),
):
    exp = _dt_local_to_epoch(expires_at)

    kwargs: dict = {"note": note, "expires_at": exp}

    max_uses = (max_uses or "").strip()
    if max_uses:
        try:
            maxu = int(max_uses)
            if maxu <= 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="max_uses must be a positive integer")
        kwargs["max_uses"] = maxu
    else:
        kwargs["max_uses"] = None

    monthly_limit = (monthly_limit or "").strip()
    if monthly_limit:
        try:
            ml = int(monthly_limit)
            if ml <= 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="monthly_limit must be a positive integer")
        kwargs["monthly_limit"] = ml
    else:
        kwargs["monthly_limit"] = None

    licensing.update_license(key, **kwargs)
    return _redirect_back(return_qs)


@router.post("/admin/licenses/set-unlock-all")
def admin_set_unlock_all(
    key: str = Form(...),
    enabled: str = Form(""),
    return_qs: str = Form(""),
):
    desired = (enabled or "").strip() in {"1", "true", "yes", "on"}
    licensing.set_license_unlock_all_steps(key, enabled=desired)
    return _redirect_back(return_qs)


@router.post("/admin/licenses/set-workspace-expiry")
def admin_set_workspace_expiry(
    key: str = Form(...),
    disabled: str = Form(""),
    seconds: str = Form(""),
    return_qs: str = Form(""),
):
    desired_disabled = (disabled or "").strip() in {"1", "true", "yes", "on"}
    seconds = (seconds or "").strip()
    desired_seconds: int | None = None
    if seconds:
        try:
            desired_seconds = int(seconds)
            if desired_seconds <= 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="seconds must be a positive integer")
    licensing.set_license_workspace_expiry(key, disabled=desired_disabled, seconds=desired_seconds)
    return _redirect_back(return_qs)
