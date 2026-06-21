from __future__ import annotations

import html

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.routes.licensing import _admin_layout
from app.services.admin_settings import get_face_detection_settings, update_face_detection_settings


router = APIRouter()


@router.get("/api/admin/settings/features")
def admin_feature_flags() -> dict[str, bool | int | str]:
    s = get_face_detection_settings()
    return {
        "enable_background_removal_ops": bool(s.enable_background_removal_ops),
        "enable_center_on_face_ops": bool(s.enable_center_on_face_ops),
        "enable_heavy_generation_ops": bool(s.enable_heavy_generation_ops),
        "tool_session_timeout_seconds": int(s.tool_session_timeout_seconds),
        "workspace_lock_timeout_seconds": int(s.workspace_lock_timeout_seconds),
        "workspace_heartbeat_interval_seconds": int(s.workspace_heartbeat_interval_seconds),
        "workspace_cleanup_interval_seconds": int(s.workspace_cleanup_interval_seconds),
        "auto_delete_expired_workspaces": bool(s.auto_delete_expired_workspaces),
        "enable_admin_workspace_takeover": bool(s.enable_admin_workspace_takeover),
        "commercial_workspace_key_mode": str(s.commercial_workspace_key_mode),
        "workspace_audit_retention_days": int(s.workspace_audit_retention_days),
    }


@router.get("/admin/settings", response_class=HTMLResponse)
def admin_settings(request: Request):
    s = get_face_detection_settings()
    saved = (request.query_params.get("saved") or "").strip().lower()
    notice = ""
    if saved == "features":
        notice = "<div class='card success'><strong>Feature settings updated.</strong></div>"
    elif saved == "face":
        notice = "<div class='card success'><strong>Face-detection settings updated.</strong></div>"
    elif saved == "auth":
        notice = "<div class='card success'><strong>Admin username updated.</strong></div>"

    content = f"""
  <h1>Admin Settings</h1>
  <p class='muted'>Manage admin access, generation controls, and face-detection behavior.</p>

  {notice}

  <div class=\"card\">
    <h2>Admin Login Credentials</h2>
    <form method=\"post\" action=\"/admin/settings/auth\">
      <label>Admin username</label>
      <input name=\"admin_username\" value=\"{html.escape(s.admin_username)}\" autocomplete=\"username\" />
      <div class=\"muted\" style=\"margin-top:8px;\">
        Password is controlled by <code>YMGA_LICENSE_ADMIN_PASSWORD</code> (environment variable).
      </div>
      <div style=\"margin-top: 12px;\">
        <button type=\"submit\">Save login username</button>
      </div>
    </form>
  </div>

  <div class=\"card\">
    <h2>Generation Features</h2>
    <form method=\"post\" action=\"/admin/settings/features\">
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_background_removal_ops\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_background_removal_ops else ""} />
        Enable baby background removal operations
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_center_on_face_ops\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_center_on_face_ops else ""} />
        Enable baby center-on-face operations
      </label>

      <h3 style=\"margin-top: 14px;\">Admin session security</h3>
      <div class=\"row\">
        <div>
          <label>Idle timeout (seconds)</label>
          <input name=\"admin_idle_timeout_seconds\" value=\"{s.admin_idle_timeout_seconds}\" />
        </div>
        <div>
          <label>Max session age (seconds)</label>
          <input name=\"admin_max_session_seconds\" value=\"{s.admin_max_session_seconds}\" />
        </div>
      </div>
      <div class=\"muted\" style=\"margin-top:8px;\">
        Idle timeout logs out inactive admin sessions. Max age forces re-login even when active.
      </div>
        <h3 style="margin-top: 14px;">Tool session timeout</h3>
        <div class="row">
          <div>
            <label>Tool session timeout (seconds)</label>
            <input name="tool_session_timeout_seconds" value="{s.tool_session_timeout_seconds}" />
          </div>
        </div>
        <div class="muted" style="margin-top:8px;">
          Controls how long the tool workspace session stays active before automatic expiry/cleanup.
        </div>

      <h3 style="margin-top: 14px;">Workspace ownership + lock controls</h3>
      <div class="row">
        <div>
          <label>Commercial workspace key mode</label>
          <select name="commercial_workspace_key_mode">
            <option value="license_only" {"selected" if s.commercial_workspace_key_mode == "license_only" else ""}>License only (shared across devices)</option>
            <option value="license_and_device" {"selected" if s.commercial_workspace_key_mode == "license_and_device" else ""}>License + device (isolated per device)</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Workspace lock timeout (seconds)</label>
          <input name="workspace_lock_timeout_seconds" value="{s.workspace_lock_timeout_seconds}" />
        </div>
        <div>
          <label>Workspace heartbeat interval (seconds)</label>
          <input name="workspace_heartbeat_interval_seconds" value="{s.workspace_heartbeat_interval_seconds}" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Workspace cleanup interval (seconds)</label>
          <input name="workspace_cleanup_interval_seconds" value="{s.workspace_cleanup_interval_seconds}" />
        </div>
        <div>
          <label>Workspace audit retention (days)</label>
          <input name="workspace_audit_retention_days" value="{s.workspace_audit_retention_days}" />
        </div>
      </div>
      <label style="display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;">
        <input type="checkbox" name="auto_delete_expired_workspaces" value="1" style="width:auto" {"checked" if s.auto_delete_expired_workspaces else ""} />
        Auto-delete expired workspaces
      </label>
      <label style="display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;">
        <input type="checkbox" name="enable_admin_workspace_takeover" value="1" style="width:auto" {"checked" if s.enable_admin_workspace_takeover else ""} />
        Allow admin force-takeover for commercial workspace locks
      </label>

      <div style=\"margin-top: 12px;\">
        <button type=\"submit\">Save feature settings</button>
      </div>
    </form>
  </div>

  <div class=\"card\">
    <h2>Face Detection (center-on-face)</h2>
    <form method=\"post\" action=\"/admin/settings/face\">
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_yunet\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_yunet else ""} />
        Enable YuNet (disabled by default; RetinaFace is prioritized)
      </label>

      <div class=\"row\">
        <div>
          <label>RetinaFace ONNX path</label>
          <input name="retinaface_model_path" value="{html.escape(s.retinaface_model_path)}" placeholder="e.g. /path/to/models/retinaface.onnx" />
        </div>
        <div>
          <label>RetinaFace input size</label>
          <input name=\"retinaface_input_size\" value=\"{s.retinaface_input_size}\" />
        </div>
        <div>
          <label>RetinaFace confidence</label>
          <input name=\"retinaface_confidence\" value=\"{s.retinaface_confidence}\" />
        </div>
      </div>

      <div class=\"row\">
        <div>
          <label>YuNet ONNX path</label>
          <input name="yunet_model_path" value="{html.escape(s.yunet_model_path)}" placeholder="e.g. /path/to/models/yunet.onnx" />
        </div>
        <div>
          <label>YuNet input size</label>
          <input name=\"yunet_input_size\" value=\"{s.yunet_input_size}\" />
        </div>
        <div>
          <label>YuNet score threshold</label>
          <input name=\"yunet_score_threshold\" value=\"{s.yunet_score_threshold}\" />
        </div>
      </div>

      <div style=\"margin-top: 12px;\">
        <button type=\"submit\">Save settings</button>
      </div>
    </form>
  </div>

  <div class=\"card\">
    <h3>Notes</h3>
    <ul>
      <li>RetinaFace is always attempted first when a model path is provided.</li>
      <li>If the model path is empty, the server will try the <code>retina-face</code> pip package (if installed).</li>
      <li>YuNet runs only when enabled above and a model path is provided.</li>
      <li>Both models should be ONNX files compatible with OpenCV / ONNX Runtime.</li>
    </ul>
  </div>
"""
    return HTMLResponse(content=_admin_layout(title="YMGA Admin Settings", active="settings", content=content), status_code=200)


@router.post("/admin/settings/auth")
def admin_settings_auth(admin_username: str = Form("admin")):
    username = (admin_username or "").strip() or "admin"
    update_face_detection_settings({"admin_username": username})
    return RedirectResponse(url="/admin/settings?saved=auth", status_code=303)


@router.post("/admin/settings/face", response_class=HTMLResponse)
def admin_settings_face(
    enable_yunet: str | None = Form(None),
    retinaface_model_path: str = Form(""),
    retinaface_input_size: str = Form(""),
    retinaface_confidence: str = Form(""),
    yunet_model_path: str = Form(""),
    yunet_input_size: str = Form(""),
    yunet_score_threshold: str = Form(""),
):
    updates = {
        "enable_yunet": bool(enable_yunet),
        "retinaface_model_path": retinaface_model_path.strip(),
        "retinaface_input_size": retinaface_input_size.strip(),
        "retinaface_confidence": retinaface_confidence.strip(),
        "yunet_model_path": yunet_model_path.strip(),
        "yunet_input_size": yunet_input_size.strip(),
        "yunet_score_threshold": yunet_score_threshold.strip(),
    }
    update_face_detection_settings(updates)
    return RedirectResponse(url="/admin/settings?saved=face", status_code=303)


@router.post("/admin/settings/features", response_class=HTMLResponse)
def admin_settings_features(
    enable_background_removal_ops: str | None = Form(None),
    enable_center_on_face_ops: str | None = Form(None),
    admin_idle_timeout_seconds: str = Form(""),
    admin_max_session_seconds: str = Form(""),
    tool_session_timeout_seconds: str = Form(""),
    workspace_lock_timeout_seconds: str = Form(""),
    workspace_heartbeat_interval_seconds: str = Form(""),
    workspace_cleanup_interval_seconds: str = Form(""),
    auto_delete_expired_workspaces: str | None = Form(None),
    enable_admin_workspace_takeover: str | None = Form(None),
    commercial_workspace_key_mode: str = Form("license_only"),
    workspace_audit_retention_days: str = Form("30"),
):
    def _parse_timeout(raw: str, default: int, minimum: int) -> int:
        try:
            value = int((raw or "").strip())
        except ValueError:
            value = default
        return max(minimum, value)

    current = get_face_detection_settings()
    idle = _parse_timeout(admin_idle_timeout_seconds, current.admin_idle_timeout_seconds, 60)
    max_age = _parse_timeout(admin_max_session_seconds, current.admin_max_session_seconds, idle)
    tool_timeout = _parse_timeout(tool_session_timeout_seconds, current.tool_session_timeout_seconds, 60)
    lock_timeout = _parse_timeout(workspace_lock_timeout_seconds, current.workspace_lock_timeout_seconds, 30)
    heartbeat_interval = _parse_timeout(
        workspace_heartbeat_interval_seconds,
        current.workspace_heartbeat_interval_seconds,
        5,
    )
    cleanup_interval = _parse_timeout(
        workspace_cleanup_interval_seconds,
        current.workspace_cleanup_interval_seconds,
        10,
    )
    audit_retention_days = _parse_timeout(workspace_audit_retention_days, current.workspace_audit_retention_days, 1)
    key_mode = (commercial_workspace_key_mode or "license_only").strip().lower()
    if key_mode not in {"license_only", "license_and_device"}:
        key_mode = "license_only"

    update_face_detection_settings(
        {
            "enable_background_removal_ops": bool(enable_background_removal_ops),
            "enable_center_on_face_ops": bool(enable_center_on_face_ops),
            "enable_heavy_generation_ops": bool(enable_background_removal_ops and enable_center_on_face_ops),
            "admin_idle_timeout_seconds": idle,
            "admin_max_session_seconds": max_age,
            "tool_session_timeout_seconds": tool_timeout,
            "workspace_lock_timeout_seconds": lock_timeout,
            "workspace_heartbeat_interval_seconds": heartbeat_interval,
            "workspace_cleanup_interval_seconds": cleanup_interval,
            "auto_delete_expired_workspaces": bool(auto_delete_expired_workspaces),
            "enable_admin_workspace_takeover": bool(enable_admin_workspace_takeover),
            "commercial_workspace_key_mode": key_mode,
            "workspace_audit_retention_days": audit_retention_days,
        }
    )
    return RedirectResponse(url="/admin/settings?saved=features", status_code=303)
