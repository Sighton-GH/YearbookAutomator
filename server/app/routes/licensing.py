import calendar
import os
import time
from html import escape
from secrets import compare_digest
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from app.services import licensing
from app.services import licensing_usage


router = APIRouter()
security = HTTPBasic()


def _require_admin(credentials: Annotated[HTTPBasicCredentials, Depends(security)]) -> None:
    expected = os.getenv("YMGA_LICENSE_ADMIN_PASSWORD", "").strip()
    # If not configured, admin panel is intentionally left unlocked (dev/local convenience).
    # The UI will display a prominent warning reminding you to set the password.
    if not expected:
        return

    # Username is ignored; only the password gates access.
    if not credentials.password or not compare_digest(credentials.password, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


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
def admin_panel(_: Annotated[None, Depends(_require_admin)]):
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

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>YMGA License Admin</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 20px; }}
    .card {{ border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin-bottom: 14px; }}
    label {{ display: block; margin: 8px 0 4px; font-weight: 600; }}
    input, select {{ width: min(560px, 100%); padding: 8px; }}
    button {{ padding: 10px 14px; font-weight: 700; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border-bottom: 1px solid #eee; padding: 8px; text-align: left; font-size: 13px; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  </style>
</head>
<body>
  <h1>License Admin</h1>

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
        </tr>
      </thead>
      <tbody>
        {"".join(license_rows) if license_rows else "<tr><td colspan='14'>No licenses yet</td></tr>"}
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
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


@router.post("/admin/licenses/create")
def admin_create(
    _: Annotated[None, Depends(_require_admin)],
    license_type: Literal["personal", "commercial"] = Form(...),
    expires_at: str = Form(""),
    max_uses: str = Form(""),
    note: str = Form(""),
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
    )

    html = f"""<!doctype html>
<html><head><meta charset='utf-8'/><title>Created</title></head>
<body style='font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 20px;'>
  <h1>License key created</h1>
  <p><strong>License key</strong>:</p>
  <pre style='padding: 12px; border: 1px solid #ddd; border-radius: 10px; background: #fafafa; font-size: 14px;'>{escape(key)}</pre>
  <p><a href='/admin/licenses'>Back to admin</a></p>
</body></html>"""
    return HTMLResponse(content=html, status_code=200)


@router.post("/admin/licenses/revoke")
def admin_revoke(
    _: Annotated[None, Depends(_require_admin)],
    key: str = Form(...),
):
    licensing.revoke_license(key)
    return RedirectResponse(url="/admin/licenses", status_code=303)
