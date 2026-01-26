from __future__ import annotations

import html
from typing import Annotated

from fastapi import APIRouter, Depends, Form
from fastapi.responses import HTMLResponse

from app.routes.licensing import _require_admin
from app.services.admin_settings import get_face_detection_settings, update_face_detection_settings


router = APIRouter()


@router.get("/admin/settings", response_class=HTMLResponse)
def admin_settings(_: Annotated[None, Depends(_require_admin)]):
    s = get_face_detection_settings()
    html_body = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>YMGA Admin Settings</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 20px; }}
    .card {{ border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin-bottom: 14px; }}
    label {{ display: block; margin: 8px 0 4px; font-weight: 600; }}
    input {{ width: min(640px, 100%); padding: 8px; }}
    button {{ padding: 10px 14px; font-weight: 700; }}
    .row {{ display: flex; gap: 16px; flex-wrap: wrap; }}
    .row > div {{ flex: 1 1 280px; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  </style>
</head>
<body>
  <h1>Admin Settings</h1>
  <p><a href=\"/admin/licenses\">Back to license admin</a></p>

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
          <input name=\"retinaface_model_path\" value=\"{html.escape(s.retinaface_model_path)}\" placeholder=\"e.g. D:\\models\\retinaface.onnx\" />
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
          <input name=\"yunet_model_path\" value=\"{html.escape(s.yunet_model_path)}\" placeholder=\"e.g. D:\\models\\yunet.onnx\" />
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
      <li>YuNet runs only when enabled above and a model path is provided.</li>
      <li>Both models should be ONNX files compatible with OpenCV / ONNX Runtime.</li>
    </ul>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html_body, status_code=200)


@router.post("/admin/settings/face", response_class=HTMLResponse)
def admin_settings_face(
    _: Annotated[None, Depends(_require_admin)],
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
    return HTMLResponse(
        content="""<html><body>
        <p>Settings updated.</p>
        <p><a href='/admin/settings'>Back to settings</a></p>
        </body></html>""",
        status_code=200,
    )
