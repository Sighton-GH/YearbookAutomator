import calendar
import base64
import hashlib
import hmac
import json
import os
import time
from html import escape
from secrets import compare_digest, token_hex
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.services import licensing
from app.services import licensing_usage
from app.services.admin_settings import get_face_detection_settings


router = APIRouter()


_ADMIN_COOKIE_NAME = "ymga_admin_session"
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
  return os.getenv("YMGA_LICENSE_ADMIN_PASSWORD", "Sighton!2026").strip()


def _admin_password_is_configured() -> bool:
    return bool(_admin_expected_password())


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
        return (True, None, None)

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
        samesite="lax",
        secure=secure,
        path="/",
    )


def clear_admin_session_cookie(response: HTMLResponse | RedirectResponse) -> None:
  response.delete_cookie(_ADMIN_COOKIE_NAME, path="/")


def _login_redirect_url(next_path: str = "/admin/licenses", reason: str | None = None) -> str:
  safe_next = next_path if next_path.startswith("/") else "/admin/licenses"
  qp = f"next={quote(safe_next, safe='')}"
  if reason:
    qp += f"&reason={quote(reason, safe='')}"
  return f"/admin/login?{qp}"


def admin_basic_auth_valid(request: Request) -> bool:
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
    password_ok = True if not expected_password else compare_digest((password or "").strip(), expected_password)
    return bool(user_ok and password_ok)


def _admin_nav(active: str = "") -> str:
    links = [
        ("home", "Admin Home", "/"),
        ("licenses", "Licenses", "/admin/licenses"),
        ("settings", "Settings", "/admin/settings"),
    ]
    nav_links: list[str] = []
    for key, label, href in links:
        cls = "nav-link active" if key == active else "nav-link"
        nav_links.append(f"<a class='{cls}' href='{href}'>{label}</a>")
    return (
        "<nav class='admin-nav'>"
        f"<div class='admin-nav-links'>{''.join(nav_links)}</div>"
        "<form method='post' action='/admin/logout' style='margin:0'>"
        "<button type='submit'>Sign out</button>"
        "</form>"
        "</nav>"
    )


def _admin_layout(*, title: str, active: str, content: str) -> str:
    return f"""<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1' />
  <title>{escape(title)}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 20px; }}
    .admin-nav {{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }}
    .admin-nav-links {{ display:flex; gap:8px; flex-wrap:wrap; }}
    .nav-link {{ border:1px solid #ddd; border-radius:8px; padding:8px 10px; text-decoration:none; color:inherit; font-weight:600; }}
    .nav-link.active {{ border-color:#2563eb; background:#eff6ff; }}
    .grid {{ display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }}
    .card {{ border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin-bottom: 14px; }}
    .warn {{ border-color: #f59e0b; background: #fffbeb; }}
    .success {{ border-color: #16a34a; background: #f0fdf4; }}
    .muted {{ color: #444; }}
    label {{ display: block; margin: 8px 0 4px; font-weight: 600; }}
    input, select {{ width: min(640px, 100%); padding: 8px; }}
    button {{ padding: 10px 14px; font-weight: 700; }}
    a.btn {{ padding: 10px 14px; font-weight: 700; text-decoration: none; display: inline-block; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border-bottom: 1px solid #eee; padding: 8px; text-align: left; font-size: 13px; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  </style>
</head>
<body>
  {_admin_nav(active)}
  {content}
</body>
</html>"""


def _require_admin(_: Request) -> None:
    return None


@router.get("/", response_class=HTMLResponse)
def home(request: Request):
    is_authed, _, _ = get_admin_session_state(request)
    has_pw = _admin_password_is_configured()
    admin_username = _admin_expected_username()
    warning = "" if has_pw else (
        "<div class='card warn'><strong>Admin password is not configured.</strong> "
        "Set <code>YMGA_LICENSE_ADMIN_PASSWORD</code> and restart the backend.</div>"
    )
    status = (
        "<div class='muted'>Admin session active on this browser.</div>"
        if is_authed or not has_pw
        else "<div class='muted'>Enter admin password to access admin pages.</div>"
    )
    content = f"""
  <h1>Admin Home</h1>
  {warning}
  <div class='card'>
    <h2>Admin login</h2>
    <p class='muted'>Username: <code>{escape(admin_username)}</code></p>
    {status}
    <form method='post' action='/admin/login'>
      <input type='hidden' name='next' value='/admin/licenses' />
      <label>Username</label><br />
      <input type='text' name='username' value='{escape(admin_username)}' autocomplete='username' />
      <br />
      <label>Password</label><br />
      <input type='password' name='password' placeholder='Enter admin password' autocomplete='current-password' />
      <div style='margin-top:10px;'>
        <button type='submit'>Sign in</button>
      </div>
    </form>
    <form method='post' action='/admin/logout' style='margin-top:8px;'>
      <button type='submit'>Sign out</button>
    </form>
  </div>
  <div class='grid'>
    <div class='card'>
      <h3>License Admin</h3>
      <p class='muted'>Create, revoke, and inspect license usage.</p>
      <a class='btn' href='/admin/licenses'>Open</a>
    </div>
    <div class='card'>
      <h3>Feature Settings</h3>
      <p class='muted'>Manage generation and face-detection settings.</p>
      <a class='btn' href='/admin/settings'>Open</a>
    </div>
    <div class='card'>
      <h3>Health Check</h3>
      <p class='muted'>Confirm backend status.</p>
      <a class='btn' href='/health'>Open</a>
    </div>
  </div>
"""
    return HTMLResponse(content=_admin_layout(title="YMGA Admin Home", active="home", content=content), status_code=200)


@router.get("/admin", response_class=HTMLResponse)
def admin_root():
    return RedirectResponse(url="/", status_code=303)


@router.get("/admin/login", response_class=HTMLResponse)
def admin_login_page(request: Request, next: str = "/admin/licenses", reason: str = ""):
  safe_next = next if next.startswith("/") else "/admin/licenses"
  return RedirectResponse(url=safe_next, status_code=303)


@router.post("/admin/login")
def admin_login(request: Request, username: str = Form(""), password: str = Form(""), next: str = Form("/admin/licenses")):
  safe_next = next if next.startswith("/") else "/admin/licenses"
  expected_user = _admin_expected_username()
  expected = _admin_expected_password()
  user_ok = compare_digest((username or "").strip(), expected_user)
  password_ok = True if not expected else compare_digest((password or "").strip(), expected)
  if not (user_ok and password_ok):
    return RedirectResponse(url=_login_redirect_url(safe_next, reason="invalid"), status_code=303)

  token = _encode_admin_session(iat=int(time.time()), lat=int(time.time()))
  resp = RedirectResponse(url=safe_next, status_code=303)
  set_admin_session_cookie(resp, token, secure=(request.url.scheme == "https"))
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
def validate_license(req: LicenseValidateRequest, request: Request):
    ip = _client_ip(request)
    device_id = licensing.get_device_id_from_headers(request.headers)
    ok, meta = licensing.validate_license(req.key, ip=ip, device_id=device_id)
    if ok:
        return LicenseValidateResponse(
            valid=True,
            license_type=meta.get("license_type"),
            expires_at=meta.get("expires_at"),
        unlock_all_steps=bool(meta.get("unlock_all_steps", False)),
        )
    return LicenseValidateResponse(valid=False, reason=str(meta.get("reason")))


class FreeKeyRequest(BaseModel):
    accepted_non_commercial_terms: bool


class FreeKeyResponse(BaseModel):
    key: str


@router.post("/api/licensing/free-key", response_model=FreeKeyResponse)
def free_key(req: FreeKeyRequest, request: Request):
    if not req.accepted_non_commercial_terms:
        raise HTTPException(status_code=400, detail="Must accept non-commercial terms")

    ip = _client_ip(request)
    device_id = licensing.get_device_id_from_headers(request.headers)
    if not device_id:
        raise HTTPException(status_code=400, detail="Missing device id")

    key = licensing.get_or_create_personal_license(ip=ip, device_id=device_id, note="free personal")
    return FreeKeyResponse(key=key)


@router.get("/admin/licenses", response_class=HTMLResponse)
def admin_panel(request: Request):
    admin_pw_set = bool(os.getenv("YMGA_LICENSE_ADMIN_PASSWORD", "").strip())
    records = licensing.list_licenses()
    usage = licensing_usage.get_recent_usage(limit=500)

    license_rows: list[str] = []
    now_ts = int(time.time())
    for rec in sorted(records, key=lambda r: r.issued_at, reverse=True)[:500]:
        issued = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(rec.issued_at))
        expires = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(rec.expires_at)) if rec.expires_at else ""
        last_used = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(rec.last_used_at)) if rec.last_used_at else ""

        key_display = rec.key or ""
        if not key_display and rec.key_hash:
            key_display = f"(legacy hashed) {rec.key_hash[:12]}…"

        revoke_form = ""
        if rec.key:
            revoke_form = (
                "<form method='post' action='/admin/licenses/revoke' style='margin:0'>"
                f"<input type='hidden' name='key' value='{escape(rec.key)}'/>"
                "<button type='submit'>Revoke</button>"
                "</form>"
            )

        unlock_form = ""
        if rec.key:
          desired = "0" if rec.unlock_all_steps else "1"
          btn = "Disable" if rec.unlock_all_steps else "Enable"
          unlock_form = (
            "<form method='post' action='/admin/licenses/set-unlock-all' style='margin:0'>"
            f"<input type='hidden' name='key' value='{escape(rec.key)}'/>"
            f"<input type='hidden' name='enabled' value='{escape(desired)}'/>"
            f"<button type='submit'>{escape(btn)}</button>"
            "</form>"
          )

        tied = bool(rec.bound_ip or rec.bound_device_id)
        bound_ip = rec.bound_ip or ""
        bound_device_id = rec.bound_device_id or ""

        max_uses_display = "" if rec.max_uses is None else str(rec.max_uses)
        usage_reset_display = ""
        if rec.license_type == "personal":
          monthly_limit = rec.monthly_limit or licensing.personal_monthly_limit_default()
          max_uses_display = f"{monthly_limit}/mo"
          reset_ts = _next_month_reset_utc(now_ts)
          usage_reset_display = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(reset_ts))

        license_rows.append(
            "<tr>"
            f"<td><code>{escape(key_display)}</code></td>"
            f"<td>{escape(rec.license_type)}</td>"
          f"<td>{'yes' if rec.unlock_all_steps else 'no'}</td>"
            f"<td>{'yes' if tied else 'no'}</td>"
            f"<td>{escape(bound_ip) if tied else ''}</td>"
            f"<td>{escape(bound_device_id) if tied else ''}</td>"
            f"<td>{escape(issued)}</td>"
            f"<td>{escape(expires)}</td>"
            f"<td>{escape(str(rec.uses))}</td>"
            f"<td>{escape(max_uses_display)}</td>"
            f"<td>{escape(usage_reset_display)}</td>"
            f"<td>{escape(last_used)}</td>"
            f"<td>{'yes' if rec.revoked else 'no'}</td>"
            f"<td>{escape(rec.note or '')}</td>"
          f"<td>{revoke_form}</td>"
          f"<td>{unlock_form}</td>"
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
            f"<td>{escape(str(ev.get('license_type', '') or ''))}</td>"
            f"<td>{escape(str(ev.get('ip', '') or ''))}</td>"
            f"<td>{escape(str(ev.get('device_id', '') or ''))}</td>"
            f"<td>{escape(str(ev.get('route', '') or ''))}</td>"
            "</tr>"
        )

    warning = "" if admin_pw_set else (
        "<div class='card' style='border-color:#f59e0b;background:#fffbeb'>"
        "<strong>Warning:</strong> Admin password is NOT set. This panel is currently unprotected."
        "<div style='margin-top:8px'>To enable protection, set the environment variable "
        "<code>YMGA_LICENSE_ADMIN_PASSWORD</code> and restart the backend.</div>"
        "</div>"
    )

    content = f"""
  <h1>License Admin</h1>
  <p class='muted'>Create, revoke, and inspect license usage.</p>

  {warning}

  <div class="card">
    <h2>Create license key</h2>
    <form method="post" action="/admin/licenses/create">
      <label>Type</label>
      <select name="license_type">
        <option value="commercial">commercial</option>
        <option value="personal">personal</option>
      </select>
      <label>Expires at (unix epoch seconds, optional)</label>
      <input name="expires_at" placeholder="e.g. 1767225600" />
      <label>Max uses (optional)</label>
      <input name="max_uses" placeholder="e.g. 100" />
      <label>Note (optional)</label>
      <input name="note" placeholder="customer / invoice / etc" />
      <label style="display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;">
        <input type="checkbox" name="unlock_all_steps" value="1" style="width:auto" />
        Unlock all steps (bypass step gating)
      </label>
      <div style="margin-top: 10px;">
        <button type="submit">Create</button>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>Revoke license key</h2>
    <form method="post" action="/admin/licenses/revoke">
      <label>License key (full)</label>
      <input name="key" placeholder="YMGA1-..." />
      <div style="margin-top: 10px;">
        <button type="submit">Revoke</button>
      </div>
    </form>
    <p style="margin: 8px 0 0; color: #444;">Note: revocation needs the full key string.</p>
  </div>

  <div class="card">
    <h2>Recent licenses (max 500)</h2>
    <table>
      <thead>
        <tr>
          <th>key</th>
          <th>type</th>
          <th>unlock all</th>
          <th>tied</th>
          <th>ip</th>
          <th>device id</th>
          <th>issued</th>
          <th>expires</th>
          <th>uses</th>
          <th>max uses</th>
          <th>usage reset</th>
          <th>last used</th>
          <th>revoked</th>
          <th>note</th>
          <th>action</th>
          <th>unlock action</th>
        </tr>
      </thead>
      <tbody>
        {"".join(license_rows) if license_rows else "<tr><td colspan='16'>No licenses yet</td></tr>"}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2>Recent usage (last 500)</h2>
    <div style="margin: 6px 0 10px; color: #444;">Note: browsers cannot provide a real MAC address; this logs a per-browser device id instead.</div>
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
        {"".join(usage_rows) if usage_rows else "<tr><td colspan='6'>No usage yet</td></tr>"}
      </tbody>
    </table>
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
):
    exp: int | None = None
    expires_at = (expires_at or "").strip()
    if expires_at:
        try:
            exp = int(expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="expires_at must be an integer unix epoch seconds")

    maxu: int | None = None
    max_uses = (max_uses or "").strip()
    if max_uses:
        try:
            maxu = int(max_uses)
            if maxu <= 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="max_uses must be a positive integer")

    key = licensing.create_license(
        license_type=license_type,
        expires_at=exp,
        max_uses=maxu,
        note=(note or "").strip() or None,
        unlock_all_steps=bool((unlock_all_steps or "").strip()),
    )

    html = f"""<!doctype html>
  <html><head><meta charset='utf-8'/><title>Created</title></head>
  <body style='font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 20px;'>
  <h1>License key created</h1>
  <p><strong>License key</strong>:</p>
  <pre style='padding: 12px; border: 1px solid #ddd; border-radius: 10px; background: #fafafa; font-size: 14px;'>{escape(key)}</pre>
  <p><a href='/admin/licenses'>Back to admin</a></p>
</body></html>"""
    return HTMLResponse(
      content=_admin_layout(
        title="License Created",
        active="licenses",
        content=(
          "<h1>License key created</h1>"
          "<div class='card success'><strong>Copy this key now.</strong></div>"
          f"<pre style='padding: 12px; border: 1px solid #ddd; border-radius: 10px; background: #fafafa; font-size: 14px;'>{escape(key)}</pre>"
          "<p><a href='/admin/licenses'>Back to admin</a></p>"
        ),
      ),
      status_code=200,
    )


@router.post("/admin/licenses/revoke")
def admin_revoke(
    key: str = Form(...),
):
    licensing.revoke_license(key)
    return RedirectResponse(url="/admin/licenses", status_code=303)


@router.post("/admin/licenses/set-unlock-all")
def admin_set_unlock_all(
    key: str = Form(...),
    enabled: str = Form(""),
):
    desired = (enabled or "").strip() in {"1", "true", "yes", "on"}
    licensing.set_license_unlock_all_steps(key, enabled=desired)
    return RedirectResponse(url="/admin/licenses", status_code=303)
