from __future__ import annotations

import time
from html import escape

from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse

from app.routes.admin_ui import admin_layout, audit_event_badge, badge, fmt_bytes, fmt_duration, fmt_relative, stat_card
from app.services import admin_dashboard as dash
from app.services.storage import delete_workspace
from app.services.workspace_registry import (
    admin_force_release_lock,
    prune_stale_bindings,
    recent_audit,
    unregister_workspace,
)


router = APIRouter()


def _session_status(session: dict) -> tuple[str, str]:
    if session.get("is_stale"):
        return "orphaned", "muted"
    if session.get("locked"):
        return "locked", "warn"
    if session.get("expiry_disabled"):
        return "active", "ok"
    seconds_left = int(session.get("seconds_until_expiry") or 0)
    if seconds_left <= 0:
        return "expired", "danger"
    if seconds_left < 300:
        return "expiring soon", "warn"
    return "active", "ok"


@router.get("/admin/sessions", response_class=HTMLResponse)
def admin_sessions(pruned: str = "", released: str = "", deleted: str = ""):
    snap = dash.get_dashboard_snapshot()
    sessions = snap["sessions"]
    now = int(time.time())

    notice = ""
    if pruned:
        notice = f"<div class='card success'>Removed <strong>{escape(pruned)}</strong> stale session binding(s).</div>"
    elif released:
        notice = "<div class='card success'>Checkout lock released. The workspace is now free for the next request.</div>"
    elif deleted:
        notice = "<div class='card success'>Workspace deleted.</div>"

    stat_cards = "".join(
        [
            stat_card("Active sessions", str(snap["active_session_count"])),
            stat_card("Stale / orphaned", str(snap["stale_session_count"]), kind="warn" if snap["stale_session_count"] else None),
            stat_card("Commercial locks", str(len(snap["active_locks"]))),
            stat_card("Total disk usage", fmt_bytes(snap["disk_total_bytes"])),
        ]
    )

    rows: list[str] = []
    for s in sessions:
        status_label, status_kind = _session_status(s)
        workspace_id = str(s.get("workspace_id") or "")
        short_id = workspace_id[:10] + "…" if len(workspace_id) > 10 else workspace_id

        lock_cell = "—"
        release_form = ""
        if s.get("locked"):
            lock_device = s.get("lock_device_id") or "unknown device"
            lock_expires = s.get("lock_expires_at")
            lock_cell = f"{escape(str(lock_device))}"
            if lock_expires:
                lock_cell += f" · frees {fmt_duration(max(0, int(lock_expires) - now))}"
            release_form = (
                "<form method='post' action='/admin/sessions/release' class='inline-form' "
                "onsubmit=\"return confirm('Force-release this checkout lock now?')\">"
                f"<input type='hidden' name='workspace_id' value='{escape(workspace_id)}'/>"
                "<button type='submit' class='small'>Force release</button>"
                "</form>"
            )

        delete_form = (
            "<form method='post' action='/admin/sessions/delete' class='inline-form' "
            "onsubmit=\"return confirm('Permanently delete this workspace and all of its uploaded/generated files?')\">"
            f"<input type='hidden' name='workspace_id' value='{escape(workspace_id)}'/>"
            "<button type='submit' class='small danger'>End &amp; delete</button>"
            "</form>"
        )

        rows.append(
            "<tr>"
            f"<td>{badge(status_label, status_kind)}</td>"
            f"<td><code title='{escape(workspace_id)}'>{escape(short_id)}</code></td>"
            f"<td>{badge(str(s.get('license_type') or 'unknown'), 'info' if s.get('license_type') == 'commercial' else 'muted')}</td>"
            f"<td><code>{escape(s.get('masked_license_key') or '—')}</code></td>"
            f"<td>{escape(str(s.get('device_id') or '—'))}</td>"
            f"<td>{fmt_relative(s.get('created_at'), now=now)}</td>"
            f"<td>{fmt_relative(s.get('last_seen'), now=now)}</td>"
            f"<td>{('No expiry' if s.get('expiry_disabled') else fmt_duration(s.get('seconds_until_expiry'))) if not s.get('is_stale') else '—'}</td>"
            f"<td>{fmt_bytes(s.get('disk_bytes'))}</td>"
            f"<td>{lock_cell}</td>"
            f"<td>{release_form}{delete_form}</td>"
            "</tr>"
        )

    content = f"""
  <h1 class="page-title">Sessions</h1>
  <p class="subtitle">Every tool workspace currently tracked by the server — commercial checkout locks, disk usage, and expiry.</p>

  {notice}

  <div class="stat-grid">{stat_cards}</div>

  <div class="card">
    <div class="toolbar">
      <h2 style="margin:0">Active &amp; tracked workspaces ({len(sessions)})</h2>
      <form method="post" action="/admin/sessions/prune">
        <button type="submit">Prune stale bindings</button>
      </form>
    </div>
    <p class="hint">
      "Orphaned" sessions are registry entries whose workspace folder no longer exists on disk (already cleaned up) —
      pruning just tidies the registry and is always safe. "Force release" immediately frees a commercial license's
      checkout lock without deleting any data. "End &amp; delete" immediately deletes the workspace's uploaded and
      generated files.
    </p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>status</th>
            <th>workspace</th>
            <th>license</th>
            <th>key</th>
            <th>device</th>
            <th>created</th>
            <th>last seen</th>
            <th>expires in</th>
            <th>disk usage</th>
            <th>lock holder</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {"".join(rows) if rows else "<tr><td colspan='11' class='empty-state'>No sessions tracked yet</td></tr>"}
        </tbody>
      </table>
    </div>
  </div>
"""
    return HTMLResponse(content=admin_layout(title="YMGA Admin — Sessions", active="sessions", content=content), status_code=200)


@router.post("/admin/sessions/prune")
def admin_sessions_prune():
    removed = prune_stale_bindings()
    return RedirectResponse(url=f"/admin/sessions?pruned={removed}", status_code=303)


@router.post("/admin/sessions/release")
def admin_sessions_release(workspace_id: str = Form(...)):
    ok, reason = admin_force_release_lock(workspace_id)
    if not ok:
        raise HTTPException(status_code=400, detail=reason or "release_failed")
    return RedirectResponse(url="/admin/sessions?released=1", status_code=303)


@router.post("/admin/sessions/delete")
def admin_sessions_delete(workspace_id: str = Form(...)):
    delete_workspace(workspace_id)
    unregister_workspace(workspace_id)
    return RedirectResponse(url="/admin/sessions?deleted=1", status_code=303)


@router.get("/admin/audit", response_class=HTMLResponse)
def admin_audit(limit: int = 200):
    events = recent_audit(limit=max(1, min(limit, 2000)))

    rows: list[str] = []
    for ev in events:
        workspace_id = str(ev.get("workspace_id") or "")
        short_id = workspace_id[:14] + "…" if len(workspace_id) > 14 else workspace_id
        rows.append(
            "<tr>"
            f"<td>{escape(fmt_relative(ev.get('ts')))}</td>"
            f"<td>{audit_event_badge(str(ev.get('event') or ''))}</td>"
            f"<td>{badge(str(ev.get('license_type') or '—'), 'info' if ev.get('license_type') == 'commercial' else 'muted')}</td>"
            f"<td><code title='{escape(workspace_id)}'>{escape(short_id) if short_id else '—'}</code></td>"
            f"<td>{escape(str(ev.get('device_id') or '—'))}</td>"
            f"<td>{escape(str(ev.get('detail') or '—'))}</td>"
            "</tr>"
        )

    content = f"""
  <h1 class="page-title">Audit Log</h1>
  <p class="subtitle">Workspace lifecycle events — created, resumed, released, taken over, pruned — newest first.</p>

  <div class="card">
    <div class="toolbar">
      <h2 style="margin:0">Recent events ({len(events)})</h2>
    </div>
    <p class="hint">
      Events are recorded whenever a workspace is created, resumed, expires and gets recreated, has its commercial
      checkout lock released or force-released, is taken over by an admin, or gets pruned as a stale binding.
      Retention is controlled by the "Workspace audit retention" setting in Settings.
    </p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>when</th>
            <th>event</th>
            <th>license</th>
            <th>workspace</th>
            <th>device</th>
            <th>detail</th>
          </tr>
        </thead>
        <tbody>
          {"".join(rows) if rows else "<tr><td colspan='6' class='empty-state'>No audit events recorded yet</td></tr>"}
        </tbody>
      </table>
    </div>
  </div>
"""
    return HTMLResponse(content=admin_layout(title="YMGA Admin — Audit Log", active="audit", content=content), status_code=200)
