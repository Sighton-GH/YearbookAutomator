from __future__ import annotations

import html

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.routes.admin_ui import admin_layout as _admin_layout, badge
from app.services.admin_settings import get_face_detection_settings, update_face_detection_settings
from app.services import throttle
from app.services.system_stats import get_gpu_stats


router = APIRouter()


@router.get("/api/admin/settings/features")
def admin_feature_flags() -> dict[str, bool | int | str]:
    s = get_face_detection_settings()
    return {
        "enable_background_removal_ops": bool(s.enable_background_removal_ops),
        "enable_center_on_face_ops": bool(s.enable_center_on_face_ops),
        "enable_heavy_generation_ops": bool(s.enable_heavy_generation_ops),
        "personal_workspace_timeout_seconds": int(s.personal_workspace_timeout_seconds),
        "workspace_lock_timeout_seconds": int(s.workspace_lock_timeout_seconds),
        "workspace_heartbeat_interval_seconds": int(s.workspace_heartbeat_interval_seconds),
        "workspace_cleanup_interval_seconds": int(s.workspace_cleanup_interval_seconds),
        "auto_delete_expired_workspaces": bool(s.auto_delete_expired_workspaces),
        "enable_admin_workspace_takeover": bool(s.enable_admin_workspace_takeover),
        "commercial_workspace_key_mode": str(s.commercial_workspace_key_mode),
        "workspace_audit_retention_days": int(s.workspace_audit_retention_days),
        "enable_quotes_feature": bool(s.enable_quotes_feature),
        "enable_baby_photos_feature": bool(s.enable_baby_photos_feature),
        "enable_pdf_output": bool(s.enable_pdf_output),
        "enable_tiff_output": bool(s.enable_tiff_output),
        "enable_alphabetical_sort_option": bool(s.enable_alphabetical_sort_option),
        "enable_advanced_name_matching": bool(s.enable_advanced_name_matching),
        "enable_custom_font_upload": bool(s.enable_custom_font_upload),
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
    elif saved == "performance":
        notice = "<div class='card success'><strong>Performance &amp; resource limit settings updated.</strong></div>"
    elif saved == "tool-features":
        notice = "<div class='card success'><strong>Tool feature toggles updated.</strong></div>"

    gpu_info = get_gpu_stats()
    providers_html = "".join(
        badge(p, "info" if p != "CPUExecutionProvider" else "muted") for p in gpu_info.get("onnx_providers") or []
    ) or "<span class='muted'>none detected</span>"

    content = f"""
  <h1 class="page-title">Settings</h1>
  <p class="subtitle">Manage admin access, generation controls, face-detection behavior, and performance/resource limits.</p>

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
        <h3 style="margin-top: 14px;">Personal license workspace timeout</h3>
        <div class="row">
          <div>
            <label>Personal license workspace timeout (seconds)</label>
            <input name="personal_workspace_timeout_seconds" value="{s.personal_workspace_timeout_seconds}" />
          </div>
        </div>
        <div class="muted" style="margin-top:8px;">
          Controls how long personal (free) license workspace sessions stay active before automatic expiry/cleanup.
          Commercial licenses are configured per-license instead &mdash; see the <a href="/admin/licenses">Licenses</a> page.
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
    <h2>Performance &amp; Resource Limits</h2>
    <p class=\"hint\">Keep this app from bottlenecking your internet connection or hogging CPU/GPU while other things are running. 0 always means "unlimited" / "auto".</p>
    <form method=\"post\" action=\"/admin/settings/performance\">
      <h3 style=\"margin-top:0\">Network</h3>
      <div class=\"row\">
        <div>
          <label>Upload bandwidth limit (KB/s)</label>
          <input name=\"network_upload_limit_kbps\" value=\"{s.network_upload_limit_kbps}\" placeholder=\"0 = unlimited\" />
        </div>
        <div>
          <label>Download bandwidth limit (KB/s)</label>
          <input name=\"network_download_limit_kbps\" value=\"{s.network_download_limit_kbps}\" placeholder=\"0 = unlimited\" />
        </div>
      </div>
      <div class=\"hint\">
        Throttles incoming file uploads (templates, rosters, photo ZIPs) and outgoing downloads (generated spreads)
        across the whole server, so a big batch transfer doesn't saturate your internet connection.
      </div>

      <h3>CPU</h3>
      <div class=\"row\">
        <div>
          <label>Max CPU threads</label>
          <input name=\"cpu_max_threads\" value=\"{s.cpu_max_threads}\" placeholder=\"0 = auto (all cores)\" />
        </div>
        <div>
          <label>CPU speed limit (%)</label>
          <input name=\"cpu_throttle_percent\" value=\"{s.cpu_throttle_percent}\" placeholder=\"100 = full speed\" />
        </div>
      </div>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"cpu_low_priority\" value=\"1\" style=\"width:auto\" {"checked" if s.cpu_low_priority else ""} />
        Lower process priority (let other apps win CPU contention)
      </label>
      <div class=\"hint\">
        The thread cap applies to OpenCV and newly created ML sessions immediately. The speed limit paces image
        rendering with small idle gaps so sustained CPU load stays near the target percent. On Linux/macOS, turning
        "lower priority" back off may require a backend restart (raising priority back up needs elevated permissions).
      </div>

      <h3>GPU</h3>
      <div class=\"row\">
        <div>
          <label>GPU concurrency limit</label>
          <input name=\"gpu_max_concurrent_ops\" value=\"{s.gpu_max_concurrent_ops}\" placeholder=\"0 = auto\" />
        </div>
        <div>
          <label>GPU speed limit (%)</label>
          <input name=\"gpu_throttle_percent\" value=\"{s.gpu_throttle_percent}\" placeholder=\"100 = full speed\" />
        </div>
      </div>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"gpu_disabled\" value=\"1\" style=\"width:auto\" {"checked" if s.gpu_disabled else ""} />
        Force CPU-only (disable GPU acceleration entirely)
      </label>
      <div class=\"hint\">Detected ONNX Runtime providers: {providers_html}</div>

      <div style=\"margin-top: 12px;\">
        <button type=\"submit\" class=\"primary\">Save performance settings</button>
      </div>
    </form>
  </div>

  <div class=\"card\">
    <h2>Tool Feature Toggles</h2>
    <p class=\"hint\">
      Turn off individual optional features of the tool for everyone. The 5 wizard steps themselves (Template,
      Roster &amp; Photos, People, Style, Generate) always stay available since they're sequential and required &mdash;
      these toggles only affect optional sub-features within them.
    </p>
    <form method=\"post\" action=\"/admin/settings/tool-features\">
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_quotes_feature\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_quotes_feature else ""} />
        Quotes feature (upload/edit/render student quotes)
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_baby_photos_feature\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_baby_photos_feature else ""} />
        Baby photos feature (upload/edit/render baby cutouts)
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_pdf_output\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_pdf_output else ""} />
        PDF output format
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_tiff_output\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_tiff_output else ""} />
        TIFF output format
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_alphabetical_sort_option\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_alphabetical_sort_option else ""} />
        Alphabetical sort option (Generate step)
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_advanced_name_matching\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_advanced_name_matching else ""} />
        Advanced name matching (mugshots, quotes, baby photos)
      </label>
      <label style=\"display:flex; gap:10px; align-items:center; font-weight:600; margin-top: 10px;\">
        <input type=\"checkbox\" name=\"enable_custom_font_upload\" value=\"1\" style=\"width:auto\" {"checked" if s.enable_custom_font_upload else ""} />
        Custom font upload (Style step)
      </label>
      <div class=\"hint\" style=\"margin-top:10px;\">
        Disabling a feature here takes effect the next time the tool frontend loads its admin flags (on page load,
        or within a few seconds if it's already open). It does not delete any data already using that feature.
      </div>

      <div style=\"margin-top: 12px;\">
        <button type=\"submit\" class=\"primary\">Save tool feature toggles</button>
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
    personal_workspace_timeout_seconds: str = Form(""),
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
    personal_workspace_timeout = _parse_timeout(
        personal_workspace_timeout_seconds, current.personal_workspace_timeout_seconds, 60
    )
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
            "personal_workspace_timeout_seconds": personal_workspace_timeout,
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


@router.post("/admin/settings/performance", response_class=HTMLResponse)
def admin_settings_performance(
    network_upload_limit_kbps: str = Form(""),
    network_download_limit_kbps: str = Form(""),
    cpu_max_threads: str = Form(""),
    cpu_throttle_percent: str = Form(""),
    cpu_low_priority: str | None = Form(None),
    gpu_disabled: str | None = Form(None),
    gpu_throttle_percent: str = Form(""),
    gpu_max_concurrent_ops: str = Form(""),
):
    def _parse_non_negative(raw: str, default: int) -> int:
        try:
            value = int((raw or "").strip())
        except ValueError:
            return default
        return max(0, value)

    def _parse_percent(raw: str, default: int) -> int:
        try:
            value = int((raw or "").strip())
        except ValueError:
            return default
        return min(100, max(1, value))

    current = get_face_detection_settings()
    update_face_detection_settings(
        {
            "network_upload_limit_kbps": _parse_non_negative(network_upload_limit_kbps, current.network_upload_limit_kbps),
            "network_download_limit_kbps": _parse_non_negative(network_download_limit_kbps, current.network_download_limit_kbps),
            "cpu_max_threads": _parse_non_negative(cpu_max_threads, current.cpu_max_threads),
            "cpu_throttle_percent": _parse_percent(cpu_throttle_percent, current.cpu_throttle_percent),
            "cpu_low_priority": bool(cpu_low_priority),
            "gpu_disabled": bool(gpu_disabled),
            "gpu_throttle_percent": _parse_percent(gpu_throttle_percent, current.gpu_throttle_percent),
            "gpu_max_concurrent_ops": _parse_non_negative(gpu_max_concurrent_ops, current.gpu_max_concurrent_ops),
        }
    )
    # Apply the CPU thread cap / process priority immediately rather than
    # waiting for the next generation job or a server restart.
    throttle.apply_cpu_limits()
    return RedirectResponse(url="/admin/settings?saved=performance", status_code=303)


@router.post("/admin/settings/tool-features", response_class=HTMLResponse)
def admin_settings_tool_features(
    enable_quotes_feature: str | None = Form(None),
    enable_baby_photos_feature: str | None = Form(None),
    enable_pdf_output: str | None = Form(None),
    enable_tiff_output: str | None = Form(None),
    enable_alphabetical_sort_option: str | None = Form(None),
    enable_advanced_name_matching: str | None = Form(None),
    enable_custom_font_upload: str | None = Form(None),
):
    update_face_detection_settings(
        {
            "enable_quotes_feature": bool(enable_quotes_feature),
            "enable_baby_photos_feature": bool(enable_baby_photos_feature),
            "enable_pdf_output": bool(enable_pdf_output),
            "enable_tiff_output": bool(enable_tiff_output),
            "enable_alphabetical_sort_option": bool(enable_alphabetical_sort_option),
            "enable_advanced_name_matching": bool(enable_advanced_name_matching),
            "enable_custom_font_upload": bool(enable_custom_font_upload),
        }
    )
    return RedirectResponse(url="/admin/settings?saved=tool-features", status_code=303)
