from __future__ import annotations

import time
from html import escape


# ---------------------------------------------------------------------------
# Shared presentation layer for every server-rendered admin page.
#
# This module intentionally contains no route handlers and no business logic —
# just HTML/CSS building blocks + formatting helpers reused by routes/licensing.py,
# routes/admin_settings.py, and routes/admin_dashboard.py.
# ---------------------------------------------------------------------------


_ADMIN_CSS = """
:root {
  color-scheme: dark;
  --bg: #0a0d12;
  --surface: #121722;
  --surface-2: #171d2b;
  --surface-hover: #1c2333;
  --border: #232a3a;
  --border-strong: #333c52;
  --text: #e7ebf3;
  --text-muted: #8b93a7;
  --text-dim: #5b6478;
  --accent: #4f8cff;
  --accent-soft: rgba(79, 140, 255, 0.12);
  --accent-2: #e0619c;
  --accent-2-soft: rgba(224, 97, 156, 0.12);
  --ok: #2fbf71;
  --ok-soft: rgba(47, 191, 113, 0.12);
  --warn: #f2a93c;
  --warn-soft: rgba(242, 169, 60, 0.12);
  --danger: #f2495c;
  --danger-soft: rgba(242, 73, 92, 0.12);
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --radius: 10px;
  --radius-sm: 6px;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -12px rgba(0, 0, 0, 0.5);
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: var(--sans);
  background: radial-gradient(1200px 600px at 10% -10%, rgba(79, 140, 255, 0.07), transparent 60%), var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}
a { color: var(--accent); }
.admin-topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 16px;
  padding: 10px 20px;
  background: rgba(10, 13, 18, 0.86);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.admin-brand {
  font-family: var(--mono); font-weight: 700; letter-spacing: 0.06em; font-size: 13px;
  display: flex; align-items: center; gap: 8px; white-space: nowrap; color: var(--text);
  text-decoration: none;
}
.admin-brand .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
.admin-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex: 1; flex-wrap: wrap; }
.admin-nav-links { display: flex; gap: 4px; flex-wrap: wrap; }
.nav-link {
  font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 7px 12px; border-radius: 999px; color: var(--text-muted); text-decoration: none; border: 1px solid transparent;
}
.nav-link:hover { color: var(--text); background: var(--surface-hover); }
.nav-link.active { color: var(--accent); background: var(--accent-soft); border-color: rgba(79, 140, 255, 0.3); }
.admin-content { max-width: 1360px; margin: 0 auto; padding: 22px 20px 60px; }
h1 { font-size: 20px; margin: 4px 0 4px; letter-spacing: -0.01em; }
h1.page-title { font-family: var(--mono); }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 12px; }
h3 { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 16px 0 8px; }
.muted { color: var(--text-muted); }
.subtitle { color: var(--text-muted); margin: 0 0 18px; font-size: 13px; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow);
}
.card.warn { border-color: rgba(242, 169, 60, 0.4); }
.card.success { border-color: rgba(47, 191, 113, 0.4); }
.card.danger { border-color: rgba(242, 73, 92, 0.4); }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.row { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); align-items: start; margin-top: 4px; }
.row > * { min-width: 0; }
.stat-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); margin-bottom: 16px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
.stat-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin-bottom: 6px; }
.stat-value { font-family: var(--mono); font-size: 23px; font-weight: 600; color: var(--text); }
.stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.stat-value.ok { color: var(--ok); }
.stat-value.warn { color: var(--warn); }
.stat-value.danger { color: var(--danger); }
label { display: block; margin: 10px 0 5px; font-weight: 600; font-size: 12.5px; color: var(--text-muted); }
input, select {
  width: min(640px, 100%); padding: 9px 10px; font-size: 13px;
  background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  color: var(--text); font-family: var(--sans);
}
input:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
input[type=checkbox] { width: auto; accent-color: var(--accent); }
input::placeholder { color: var(--text-dim); }
button, a.btn {
  font-family: var(--sans); font-weight: 600; font-size: 13px;
  padding: 9px 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--text);
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
button:hover, a.btn:hover { background: var(--surface-hover); border-color: var(--accent); }
button.primary, a.btn.primary { background: var(--accent); border-color: var(--accent); color: #04101f; }
button.primary:hover { filter: brightness(1.08); }
button.danger { color: var(--danger); border-color: rgba(242, 73, 92, 0.4); }
button.danger:hover { background: var(--danger-soft); }
button.small, a.btn.small { padding: 5px 10px; font-size: 12px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
thead th {
  position: sticky; top: 0; background: var(--surface-2); text-align: left; font-weight: 600;
  color: var(--text-muted); text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.05em;
  padding: 9px 10px; border-bottom: 1px solid var(--border-strong); white-space: nowrap;
}
td { padding: 9px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody tr:hover { background: var(--surface-hover); }
tbody tr:last-child td { border-bottom: none; }
code, .mono { font-family: var(--mono); font-size: 12px; color: var(--text); }
.badge {
  display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 10.5px;
  padding: 3px 8px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap;
}
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
.badge-ok { color: var(--ok); background: var(--ok-soft); border-color: rgba(47, 191, 113, 0.35); }
.badge-warn { color: var(--warn); background: var(--warn-soft); border-color: rgba(242, 169, 60, 0.35); }
.badge-danger { color: var(--danger); background: var(--danger-soft); border-color: rgba(242, 73, 92, 0.35); }
.badge-info { color: var(--accent); background: var(--accent-soft); border-color: rgba(79, 140, 255, 0.35); }
.badge-muted { color: var(--text-dim); }
.meter { height: 6px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); overflow: hidden; }
.meter > span { display: block; height: 100%; background: var(--accent); }
.meter.ok > span { background: var(--ok); }
.meter.warn > span { background: var(--warn); }
.meter.danger > span { background: var(--danger); }
.hint { font-size: 12px; color: var(--text-muted); margin-top: 6px; }
hr.divider { height: 1px; background: var(--border); margin: 16px 0; border: none; }
.empty-state { padding: 30px 14px; text-align: center; color: var(--text-muted); }
.inline-form { display: inline; margin: 0; }
.bar-chart { display: flex; align-items: flex-end; gap: 2px; }
.bar-chart-bar { flex: 1; min-width: 3px; background: var(--accent); border-radius: 3px 3px 0 0; }
.bar-chart-bar.empty { background: var(--surface-2); }
.chart-axis-row { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--text-dim); margin-top: 4px; }
.chart-axis-row.ticks { gap: 2px; }
.chart-axis-row.ticks span { flex: 1; min-width: 3px; text-align: center; overflow: hidden; white-space: nowrap; }
.chart-stat-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; color: var(--text-muted); }
.chart-stat-row strong { color: var(--text); font-family: var(--mono); font-weight: 600; }
.chart-caption { font-size: 11.5px; color: var(--text-muted); margin-top: 8px; line-height: 1.5; }
.chart-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; color: var(--text-muted); }
.chart-legend .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.svg-line-chart { display: block; width: 100%; height: auto; }
.stacked-bar { display: flex; width: 100%; height: 16px; border-radius: 4px; overflow: hidden; background: var(--surface-2); }
.stacked-bar-seg { height: 100%; }
.stacked-bar-seg + .stacked-bar-seg { border-left: 2px solid var(--surface); }
.icon-btn {
  padding: 6px 9px; font-size: 14px; line-height: 1; border-radius: var(--radius-sm);
}
.licenses-table { table-layout: fixed; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.filter-bar { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px; }
.filter-bar .field { display: flex; flex-direction: column; gap: 0; }
.filter-bar label { margin: 0 0 5px; }
.filter-bar input, .filter-bar select { width: auto; min-width: 140px; }
.filter-bar input[name="q"] { min-width: 220px; }
.pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 12px; font-size: 12.5px; color: var(--text-muted); }
.pager .pager-links { display: flex; gap: 6px; align-items: center; }
.pager a.btn.disabled { opacity: 0.4; pointer-events: none; }
dialog {
  border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface);
  color: var(--text); padding: 0; width: min(560px, 92vw); box-shadow: var(--shadow);
}
dialog::backdrop { background: rgba(5, 7, 11, 0.72); backdrop-filter: blur(2px); }
.dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.dialog-head h2 { margin: 0; }
.dialog-body { padding: 16px; max-height: 72vh; overflow-y: auto; }
.dialog-body form { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.dialog-body form:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.kv-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 12.5px; margin-bottom: 4px; }
.kv-grid dt { color: var(--text-muted); }
.kv-grid dd { margin: 0; font-family: var(--mono); word-break: break-all; }
@media (max-width: 720px) {
  .admin-topbar { flex-wrap: wrap; }
  .admin-content { padding: 16px 12px 40px; }
}
"""


def admin_nav(active: str = "") -> str:
    links = [
        ("dashboard", "Dashboard", "/"),
        ("usage", "Usage", "/admin/usage"),
        ("sessions", "Sessions", "/admin/sessions"),
        ("audit", "Audit Log", "/admin/audit"),
        ("licenses", "Licenses", "/admin/licenses"),
        ("settings", "Settings", "/admin/settings"),
    ]
    nav_links: list[str] = []
    for key, label, href in links:
        cls = "nav-link active" if key == active else "nav-link"
        nav_links.append(f"<a class='{cls}' href='{href}'>{label}</a>")
    return (
        "<div class='admin-topbar'>"
        "<a class='admin-brand' href='/'><span class='dot'></span>YMGA&nbsp;ADMIN</a>"
        "<div class='admin-nav'>"
        f"<div class='admin-nav-links'>{''.join(nav_links)}</div>"
        "<form method='post' action='/admin/logout' style='margin:0'>"
        "<button type='submit' class='small'>Sign out</button>"
        "</form>"
        "</div>"
        "</div>"
    )


def admin_layout(*, title: str, active: str, content: str) -> str:
    return f"""<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1' />
  <title>{escape(title)}</title>
  <style>{_ADMIN_CSS}</style>
</head>
<body>
  {admin_nav(active)}
  <div class='admin-content'>
    {content}
  </div>
</body>
</html>"""


def auth_required_page(message: str) -> str:
    """Minimal styled page shown when an admin request needs (re-)authentication."""

    return f"""<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1' />
  <title>Admin sign-in required</title>
  <style>{_ADMIN_CSS}</style>
</head>
<body>
  <div class='admin-content' style='max-width:480px; padding-top:14vh;'>
    <div class='card warn'>
      <h1 class='page-title'>Sign-in required</h1>
      <p class='muted'>{escape(message)}</p>
      <p class='hint'>Reload this page and enter the admin username/password when prompted by your browser.</p>
      <div style='margin-top:12px;'><a class='btn primary' href='/'>Reload</a></div>
    </div>
  </div>
</body>
</html>"""


def badge(label: str, kind: str = "muted") -> str:
    cls = {
        "ok": "badge badge-ok",
        "warn": "badge badge-warn",
        "danger": "badge badge-danger",
        "info": "badge badge-info",
    }.get(kind, "badge badge-muted")
    return f"<span class='{cls}'>{escape(label)}</span>"


def stat_card(label: str, value: str, *, sub: str | None = None, kind: str | None = None) -> str:
    value_cls = f"stat-value {kind}" if kind else "stat-value"
    sub_html = f"<div class='stat-sub'>{escape(sub)}</div>" if sub else ""
    return (
        "<div class='stat-card'>"
        f"<div class='stat-label'>{escape(label)}</div>"
        f"<div class='{value_cls}'>{escape(value)}</div>"
        f"{sub_html}"
        "</div>"
    )


def meter(percent: float, *, kind: str | None = None) -> str:
    pct = max(0.0, min(100.0, float(percent or 0)))
    auto_kind = kind
    if auto_kind is None:
        auto_kind = "danger" if pct >= 90 else ("warn" if pct >= 70 else "ok")
    cls = f"meter {auto_kind}" if auto_kind else "meter"
    return f"<div class='{cls}'><span style='width:{pct:.1f}%'></span></div>"


def bar_chart(
    values: list[float],
    *,
    height_px: int = 56,
    labels: list[str] | None = None,
    color: str = "var(--accent)",
) -> str:
    """No-JS bar chart for a short numeric series, oldest → newest.

    For a magnitude/trend-over-time series (one hue, sequential) — not for
    comparing distinct categories. `labels`, if given, must be the same
    length as `values`; use `""` entries to skip a tick so the axis stays
    readable (e.g. label every 5th bucket instead of all 30).
    """

    if not values or not any(values):
        return "<p class='muted'>No data yet.</p>"
    peak = max(values) or 1
    bars = []
    for v in values:
        h = max(2, round((v / peak) * height_px)) if v else 2
        cls = "bar-chart-bar" if v else "bar-chart-bar empty"
        style = f"height:{h}px" + (f"; background:{color}" if v and color != "var(--accent)" else "")
        bars.append(f"<div class='{cls}' style='{style}' title='{v:g}'></div>")
    chart_html = f"<div class='bar-chart' style='height:{height_px}px'>{''.join(bars)}</div>"

    if not labels:
        return chart_html

    ticks = "".join(f"<span>{escape(label) if label else ''}</span>" for label in labels)
    return f"{chart_html}<div class='chart-axis-row ticks'>{ticks}</div>"


def line_chart(
    values: list[float | None],
    *,
    y_max: float = 100.0,
    y_min: float = 0.0,
    width: int = 480,
    height: int = 84,
    color: str = "var(--accent)",
) -> str:
    """No-JS inline-SVG line chart for a single continuous series, oldest → newest.

    Fixed `y_min`/`y_max` (rather than auto-scaling to the data's own range)
    so multiple single-metric charts sharing a domain — e.g. CPU/RAM/GPU all
    0-100% — stay visually comparable. Draws one recessive reference hairline
    at the midpoint and direct-labels only the current (last) point, per the
    "label selectively" rule — the rest of the series is carried by the fill
    + the caller's own current/avg/peak caption row.
    """

    pts = [(i, v) for i, v in enumerate(values) if v is not None]
    if len(pts) < 2:
        return "<p class='muted'>Not enough data yet.</p>"

    n = len(values)
    span = (y_max - y_min) or 1.0

    def px(i: int) -> float:
        return (i / (n - 1)) * width if n > 1 else 0.0

    def py(v: float) -> float:
        v = max(y_min, min(y_max, v))
        return height - ((v - y_min) / span) * height

    poly = " ".join(f"{px(i):.1f},{py(v):.1f}" for i, v in pts)
    first_x = px(pts[0][0])
    last_i, last_v = pts[-1]
    last_x, last_y = px(last_i), py(last_v)
    area = f"{first_x:.1f},{height:.1f} {poly} {last_x:.1f},{height:.1f}"
    mid_y = py(y_min + span / 2)
    label_x = max(20.0, last_x - 6.0)
    label_y = max(12.0, last_y - 8.0)

    return f"""<svg class='svg-line-chart' viewBox='0 0 {width} {height}' role='img' aria-label='trend line'>
  <line x1='0' y1='{mid_y:.1f}' x2='{width}' y2='{mid_y:.1f}' stroke='var(--border-strong)' stroke-width='1' />
  <polygon points='{area}' fill='{color}' opacity='0.12' />
  <polyline points='{poly}' fill='none' stroke='{color}' stroke-width='2' stroke-linejoin='round' stroke-linecap='round' />
  <circle cx='{last_x:.1f}' cy='{last_y:.1f}' r='5' fill='var(--surface)' />
  <circle cx='{last_x:.1f}' cy='{last_y:.1f}' r='3.5' fill='{color}' />
  <text x='{label_x:.1f}' y='{label_y:.1f}' text-anchor='end' font-family='var(--mono)' font-size='11' fill='var(--text)'>{last_v:.0f}</text>
</svg>"""


def stacked_bar(segments: list[tuple[str, float, str]]) -> str:
    """Part-to-whole bar. `segments` = `[(label, value, css_color), ...]`.

    Always shown with a legend (part-to-whole is never a single series) —
    each swatch carries the same color as its segment so identity never
    depends on position alone.
    """

    total = sum(max(0.0, v) for _, v, _ in segments)
    if total <= 0:
        return "<p class='muted'>No data yet.</p>"

    bar = "".join(
        f"<div class='stacked-bar-seg' style='width:{(v / total) * 100:.2f}%; background:{color}' "
        f"title='{escape(label)}: {v:g} ({(v / total) * 100:.0f}%)'></div>"
        for label, v, color in segments
        if v > 0
    )
    legend = "".join(
        f"<span><span class='swatch' style='background:{color}'></span>{escape(label)} — {v:g}</span>"
        for label, v, color in segments
    )
    return f"<div class='stacked-bar'>{bar}</div><div class='chart-legend'>{legend}</div>"


AUDIT_EVENT_KIND = {
    "workspace_created": "ok",
    "workspace_resumed": "muted",
    "workspace_recreated_after_expiry": "warn",
    "workspace_released": "muted",
    "workspace_taken_over": "warn",
    "workspace_legacy_bound": "muted",
    "workspace_lock_force_released": "warn",
    "stale_bindings_pruned": "info",
}


def audit_event_badge(event_type: str) -> str:
    return badge(event_type, AUDIT_EVENT_KIND.get(event_type, "muted"))


def fmt_bytes(num_bytes: float | int | None) -> str:
    n = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024.0 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} PB"


def fmt_duration(seconds: float | int | None) -> str:
    s = int(seconds or 0)
    if s <= 0:
        return "0s"
    days, rem = divmod(s, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    parts: list[str] = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes and not days:
        parts.append(f"{minutes}m")
    if not days and not hours and not minutes:
        parts.append(f"{secs}s")
    return " ".join(parts) or "0s"


def fmt_ts(ts: float | int | None) -> str:
    if not ts:
        return ""
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(float(ts)))


def fmt_relative(ts: float | int | None, *, now: float | None = None) -> str:
    if not ts:
        return "never"
    now = now if now is not None else time.time()
    delta = now - float(ts)
    if delta < 0:
        return "just now"
    if delta < 60:
        return "just now"
    if delta < 3600:
        return f"{int(delta // 60)}m ago"
    if delta < 86400:
        return f"{int(delta // 3600)}h ago"
    return f"{int(delta // 86400)}d ago"
