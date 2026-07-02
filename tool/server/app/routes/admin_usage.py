from __future__ import annotations

from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.routes.admin_ui import (
    admin_layout,
    badge,
    bar_chart,
    fmt_bytes,
    fmt_duration,
    fmt_relative,
    line_chart,
    meter,
    stacked_bar,
    stat_card,
)
from app.services import admin_dashboard as dash


router = APIRouter()


def _avg(values: list[float]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


def _resource_block(*, title: str, series: list[float | None], sub: str, unit: str = "%") -> str:
    clean = [v for v in series if v is not None]
    now_val = clean[-1] if clean else None
    stat_row = (
        f"<div class='chart-stat-row'>"
        f"<span>now <strong>{now_val:.0f}{unit}</strong></span>"
        f"<span>avg <strong>{_avg(clean):.0f}{unit}</strong></span>"
        f"<span>peak <strong>{max(clean):.0f}{unit}</strong></span>"
        "</div>"
        if clean
        else ""
    )
    chart = line_chart(series, y_max=100, y_min=0)
    axis = "<div class='chart-axis-row'><span>60m ago</span><span>now</span></div>" if len(clean) >= 2 else ""
    return f"<h3 style='margin-top:0'>{escape(title)}</h3>{chart}{axis}{stat_row}<div class='hint'>{sub}</div>"


@router.get("/admin/usage", response_class=HTMLResponse)
def admin_usage():
    snap = dash.get_usage_snapshot()
    sysinfo = snap["system"]
    gpu = snap["gpu"]
    hist = snap["resource_history"]
    met = snap["metrics"]
    bw = snap["bandwidth"]
    lic = snap["license_summary"]
    usage = snap["usage_summary"]

    # --- Live resource usage -------------------------------------------------
    sample_minutes = round(hist["window_seconds"] / 60)
    cpu_block = _resource_block(
        title="CPU",
        series=hist["cpu_percent"],
        sub=(
            f"% utilization across {sysinfo.get('cpu_count_logical') or '?'} logical cores, sampled every "
            f"{hist['sample_interval_seconds']}s over the last {sample_minutes} min. In-memory only — resets on restart."
        ),
    )
    mem_total = (sysinfo.get("memory") or {}).get("total_bytes")
    mem_block = _resource_block(
        title="Memory",
        series=hist["memory_percent"],
        sub=(
            f"% of {fmt_bytes(mem_total)} total system RAM in use, same sampling window as CPU."
        ),
    )

    gpus = gpu.get("gpus") or []
    if gpus:
        gpu_block = _resource_block(
            title="GPU",
            series=hist["gpu_percent"],
            sub="Average utilization % across all detected GPUs (nvidia-smi), same sampling window.",
        )
        gpu_detail_rows = "".join(
            "<tr>"
            f"<td>{escape(str(g.get('name') or 'GPU'))}</td>"
            f"<td>{g.get('utilization_percent', 0):.0f}%</td>"
            f"<td>{fmt_bytes(float(g.get('memory_used_mb') or 0) * 1024 * 1024)} / {fmt_bytes(float(g.get('memory_total_mb') or 0) * 1024 * 1024)}</td>"
            f"<td>{g.get('temperature_c', 0):.0f}°C</td>"
            "</tr>"
            for g in gpus
        )
        gpu_detail = (
            "<div class='table-wrap' style='margin-top:10px'><table>"
            "<thead><tr><th>gpu</th><th>utilization</th><th>memory</th><th>temp</th></tr></thead>"
            f"<tbody>{gpu_detail_rows}</tbody></table></div>"
        )
    else:
        gpu_block = (
            "<h3 style='margin-top:0'>GPU</h3>"
            "<p class='muted'>No live GPU telemetry (nvidia-smi not detected).</p>"
        )
        gpu_detail = ""

    providers = gpu.get("onnx_providers") or []
    providers_html = "".join(
        badge(p, "info" if p != "CPUExecutionProvider" else "muted") for p in providers
    ) or "<span class='muted'>none detected</span>"

    disk = sysinfo.get("disk") or {}
    pool = snap["rembg_pool"]
    pool_html = (
        f"ML background-removal pool: <strong>{pool.get('idle', 0)} idle</strong> / "
        f"<strong>{pool.get('created', 0)} created</strong> (max {pool.get('max') or 'auto'})"
        if pool.get("created") is not None
        else "ML background-removal pool: not started yet"
    )

    # --- Request traffic -------------------------------------------------------
    request_history = snap["request_history"]
    req_labels = ["" for _ in request_history]
    if request_history:
        req_labels[0] = f"{len(request_history)}m ago"
        req_labels[len(request_history) // 2] = f"{len(request_history) // 2}m ago"
        req_labels[-1] = "now"
    request_chart = bar_chart(request_history, labels=req_labels)

    status_counts = met["status_counts"]
    status_chart = stacked_bar(
        [
            ("2xx success", status_counts.get("2xx", 0), "var(--ok)"),
            ("3xx redirect", status_counts.get("3xx", 0), "var(--accent)"),
            ("4xx client error", status_counts.get("4xx", 0), "var(--warn)"),
            ("5xx server error", status_counts.get("5xx", 0), "var(--danger)"),
            ("other", status_counts.get("other", 0), "var(--text-dim)"),
        ]
    )

    traffic_stat_cards = "".join(
        [
            stat_card("Total requests", str(met["total_requests"]), sub=f"since restart · uptime {fmt_duration(met['uptime_seconds'])}"),
            stat_card("Requests / min", f"{met['requests_per_minute']:.1f}", sub=f"{met['requests_last_5_minutes']} in last 5 min"),
            stat_card("Avg latency", f"{met['avg_latency_ms_last_minute']:.0f} ms", sub="last 1 minute"),
            stat_card(
                "Bandwidth (this run)",
                fmt_bytes(bw["total_bytes_uploaded"] + bw["total_bytes_downloaded"]),
                sub=f"{fmt_bytes(bw['total_bytes_uploaded'])} up · {fmt_bytes(bw['total_bytes_downloaded'])} down",
            ),
        ]
    )
    bw_limit_hint = (
        f"Upload cap {bw['upload_limit_kbps']} KB/s · download cap {bw['download_limit_kbps']} KB/s"
        if (bw["upload_limit_kbps"] or bw["download_limit_kbps"])
        else "No network throttle configured"
    )

    # --- Tool / license usage ---------------------------------------------------
    gen_per_day = snap["generations_per_day"]
    day_labels = list(gen_per_day["labels"])
    for i in range(len(day_labels)):
        if i != 0 and i != len(day_labels) - 1 and i % 3 != 0:
            day_labels[i] = ""
    gen_chart = bar_chart(gen_per_day["counts"], labels=day_labels)

    by_type = snap["usage_by_license_type"]
    type_chart = stacked_bar(
        [
            ("Personal", by_type["personal"], "var(--accent)"),
            ("Commercial", by_type["commercial"], "var(--accent-2)"),
            ("Other", by_type["other"], "var(--text-dim)"),
        ]
    )

    license_state_chart = stacked_bar(
        [
            ("Active", lic["active"], "var(--ok)"),
            ("Revoked", lic["revoked"], "var(--danger)"),
            ("Expired", lic["expired"], "var(--warn)"),
        ]
    )

    top_keys_rows = "".join(
        "<tr>"
        f"<td><code>{escape(row['key'][:18])}…</code></td>"
        f"<td>{row['count']}</td>"
        f"<td>{fmt_relative(row['last_used'])}</td>"
        "</tr>"
        for row in snap["top_license_keys"]
    ) or "<tr><td colspan='3' class='empty-state'>No counted usage recorded yet</td></tr>"

    usage_stat_cards = "".join(
        [
            stat_card("Uses today", str(usage["uses_today"]), sub=f"{usage['uses_this_month']} this month"),
            stat_card("Licenses issued", str(lic["total"]), sub=f"{lic['personal']} personal · {lic['commercial']} commercial"),
            stat_card("Active sessions", str(snap["active_session_count"]), sub=f"{snap['session_count']} tracked total"),
            stat_card("Workspace disk usage", fmt_bytes(snap["disk_total_bytes"])),
        ]
    )

    content = f"""
  <h1 class="page-title">Usage</h1>
  <p class="subtitle">Live resource trends, request traffic, and tool/license usage — the deep-dive behind the Dashboard's headline numbers.</p>

  <div class="card">
    <h2>Live system resources</h2>
    <div class="row">
      <div>{cpu_block}</div>
      <div>{mem_block}</div>
      <div>{gpu_block}</div>
    </div>
    {gpu_detail}
    <div class="row" style="margin-top:14px;">
      <div>
        <div class="hint">Disk (data dir) — {fmt_bytes(disk.get('used_bytes'))} / {fmt_bytes(disk.get('total_bytes'))}</div>
        {meter(disk.get('percent') or 0)}
        <div class="hint" style="margin-top:4px;">Point-in-time only — disk usage doesn't need a trend line to be useful.</div>
      </div>
      <div>
        <div class="hint" style="margin-bottom:8px;">ONNX Runtime providers: {providers_html}</div>
        <div class="hint">{pool_html}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Request traffic</h2>
    <div class="stat-grid">{traffic_stat_cards}</div>
    <div class="row">
      <div>
        <h3 style="margin-top:0">Request volume</h3>
        {request_chart}
        <div class="chart-caption">Requests received per minute, oldest → newest, last {len(request_history)} minutes. In-memory since last restart — every request is counted here, including ones rejected by the license/admin guards.</div>
      </div>
      <div>
        <h3 style="margin-top:0">Response status breakdown</h3>
        {status_chart}
        <div class="chart-caption">HTTP status class of every response since restart. A rising share of 4xx/5xx usually means a client or license problem worth checking the logs for.</div>
      </div>
    </div>
    <div class="hint" style="margin-top:10px;">{bw_limit_hint} — change in <a href="/admin/settings">Settings → Performance &amp; Resource Limits</a>.</div>
  </div>

  <div class="card">
    <h2>Tool &amp; license usage</h2>
    <div class="stat-grid">{usage_stat_cards}</div>
    <div class="row">
      <div>
        <h3 style="margin-top:0">Generations per day</h3>
        {gen_chart}
        <div class="chart-caption">Counted generation runs (license-metered, one per completed "Generate" action) by calendar day, last 14 days. Persisted — survives restarts.</div>
      </div>
      <div>
        <h3 style="margin-top:0">Usage by license type</h3>
        {type_chart}
        <div class="chart-caption">Same counted generation runs, split personal vs commercial, last {snap['usage_summary']['total_recent_events']} recorded events.</div>
      </div>
    </div>
    <div class="row" style="margin-top:14px;">
      <div>
        <h3 style="margin-top:0">License inventory</h3>
        {license_state_chart}
        <div class="chart-caption">All issued license keys by current state.</div>
      </div>
      <div>
        <h3 style="margin-top:0">Most active license keys</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>key</th><th>generations</th><th>last used</th></tr></thead>
            <tbody>{top_keys_rows}</tbody>
          </table>
        </div>
        <div class="chart-caption">Ranked by counted generation runs in the recorded usage log.</div>
      </div>
    </div>
  </div>
"""
    return HTMLResponse(content=admin_layout(title="YMGA Admin — Usage", active="usage", content=content), status_code=200)
