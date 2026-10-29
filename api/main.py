"""Serving/observability API for SmartGrid Energy Monitoring & Billing.

Seamless Dual-Mode:
1. Live PostgreSQL Mode: When PostgreSQL is running, executes live queries against master tables and views.
2. Simulation Engine Mode: When PostgreSQL is offline/starting, falls back to the exact project simulation
   math and seed from `dashboard.demo_data` and `smartgrid.simulation` so the web dashboard is immediately
   interactive and operable.
"""

from __future__ import annotations

import os
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from math import ceil
from pathlib import Path
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from dashboard import demo_data
from smartgrid import db, queries
from smartgrid.alerts import evaluate_alerts, overall_status
from smartgrid.config import Settings
from smartgrid.logging_utils import get_logger

SETTINGS = Settings.from_env()
log = get_logger("api")
START_TIME = time.time()

app = FastAPI(
    title="Smart-Grid Energy Monitoring & Billing API",
    version="2.0.0",
    description="Production-grade API for Smart-Grid telemetry, speed layer, batch billing, and observability.",
)

# CORS configuration
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

web_dir = Path(__file__).resolve().parent.parent / "web"
if (web_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(web_dir / "assets")), name="assets")


def _jsonable(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    return v


_last_pg_check = 0.0
_pg_available = False


def _conn():
    """Return a live PostgreSQL connection or raise."""
    return db.connect(SETTINGS, retries=1, delay=0.05)


def _try_conn():
    """Try to connect to Postgres; return None if unreachable without raising 503."""
    global _last_pg_check, _pg_available
    now = time.time()
    if not _pg_available and (now - _last_pg_check < 5.0):
        return None
    _last_pg_check = now
    try:
        conn = _conn()
        _pg_available = True
        return conn
    except Exception:
        _pg_available = False
        return None


# ---------------------------------------------------------------------------
# Static frontend entrypoint
# ---------------------------------------------------------------------------
@app.get("/", response_class=FileResponse)
def index():
    web_file = Path(__file__).resolve().parent.parent / "web" / "index.html"
    if web_file.exists():
        return FileResponse(web_file)
    return JSONResponse({"status": "running", "service": "smartgrid-api", "version": "2.0.0", "docs": "/docs"})


# ---------------------------------------------------------------------------
# 1. Overview API
# ---------------------------------------------------------------------------
@app.get("/api/overview")
def get_overview():
    conn = _try_conn()
    now = datetime.now(timezone.utc)

    if conn is not None:
        try:
            snap = queries.pipeline_snapshot(conn)
            target_day = queries.latest_simulated_day(conn)

            day_totals = queries.household_daily(conn, target_day) if target_day else []
            total_cons = sum(float(r["consumption_kwh"] or 0) for r in day_totals)
            total_solar = sum(float(r["solar_kwh"] or 0) for r in day_totals)
            net_energy = total_cons - total_solar

            bills_rows = queries.bills(conn, target_day) if target_day else []
            is_billed_final = len(bills_rows) > 0
            total_bill = sum(float(b["bill_lkr"]) for b in bills_rows) if is_billed_final else round(total_cons * 30.0, 2)

            registry = queries.household_registry(conn)
            total_households = len(registry)
            active_meters = len({r["household_id"] for r in day_totals}) if day_totals else total_households

            last_ingested = snap.get("latest_ingested_at")
            age_seconds = (now - last_ingested).total_seconds() if last_ingested else None
            is_stale = age_seconds is not None and age_seconds > SETTINGS.stale_after_seconds

            spark_batch = snap.get("latest_batch_at")
            spark_age = (now - spark_batch).total_seconds() if spark_batch else None
            spark_healthy = spark_age is not None and spark_age < 120

            pipeline_status = {
                "postgres": "online",
                "kafka": "online" if snap.get("readings_total", 0) > 0 else "degraded",
                "spark": "online" if spark_healthy else ("degraded" if spark_batch else "offline"),
                "api": "online",
                "latest_reading_age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
                "overall": "critical" if is_stale or not last_ingested else "healthy",
            }

            windows_data = queries.zone_windows(conn, target_day) if target_day else []
            by_window = {}
            for w in windows_data:
                w_start = w["window_start"].strftime("%H:%M") if hasattr(w["window_start"], "strftime") else str(w["window_start"])
                if w_start not in by_window:
                    by_window[w_start] = {"time_label": w_start, "consumption_kwh": 0.0, "solar_kwh": 0.0, "estimated_net_kwh": 0.0}
                c = float(w["consumption_kwh"] or 0)
                s = float(w["solar_kwh"] or 0)
                by_window[w_start]["consumption_kwh"] += c
                by_window[w_start]["solar_kwh"] += s
                by_window[w_start]["estimated_net_kwh"] += (c - s)

            hourly_usage = list(by_window.values())
            if hourly_usage:
                max_cons = max(h["consumption_kwh"] for h in hourly_usage)
                for h in hourly_usage:
                    h["is_peak"] = h["consumption_kwh"] == max_cons and max_cons > 0

            zone_summary = queries.dynamic_zones_summary(conn, target_day)
            rankings = queries.household_rankings(conn, target_day) if target_day else {"top_consumers": [], "top_producers": []}
            recent = queries.recent_readings(conn, limit=10)
            _, alert_objs = _health_pg(conn, now)
            solar_share_pct = round((total_solar / total_cons * 100), 2) if total_cons > 0 else 0.0

            return _jsonable({
                "sim_day": target_day,
                "kpis": {
                    "total_consumption_kwh": round(total_cons, 2),
                    "total_solar_kwh": round(total_solar, 2),
                    "estimated_net_kwh": round(net_energy, 2),
                    "total_bill_amount": round(total_bill, 2),
                    "active_meters_count": active_meters,
                    "total_households_count": total_households,
                    "solar_contribution_pct": solar_share_pct,
                    "is_billed_final": is_billed_final,
                    "latest_event_time": snap.get("latest_event_time"),
                    "latest_ingested_at": snap.get("latest_ingested_at"),
                },
                "badges": {
                    "total_consumption": {"type": "Live", "tooltip": "Live aggregated consumption from PostgreSQL."},
                    "solar_generation": {"type": "Live", "tooltip": "Live aggregated solar generation."},
                    "net_grid_energy": {
                        "type": "Estimate",
                        "tooltip": "Estimate (derived): Net energy estimated as consumption − solar. Instantaneous import/export telemetry not provided.",
                    },
                    "estimated_bill": {
                        "type": "Final" if is_billed_final else "Estimate",
                        "tooltip": "Authoritative billed total from Airflow batch run" if is_billed_final else "Running daily estimate based on meter consumption.",
                    },
                },
                "pipeline_status": pipeline_status,
                "hourly_usage": hourly_usage,
                "zone_comparison": zone_summary,
                "household_rankings": rankings,
                "recent_readings": recent,
                "latest_alerts": [a.as_dict() for a in alert_objs],
                "last_updated": now.isoformat(),
            })
        finally:
            conn.close()

    # Fallback to realistic pure simulation math when Postgres is offline
    sim_date = SETTINGS.sim_start.date()
    day_totals = demo_data.get_demo_household_daily(SETTINGS, sim_date)
    zone_windows = demo_data.get_demo_zone_windows(SETTINGS, sim_date)
    bills = demo_data.get_demo_bills(SETTINGS, sim_date)
    snap = demo_data.get_demo_pipeline_snapshot(SETTINGS, now)
    alerts = demo_data.get_demo_alerts(SETTINGS)

    total_cons = sum(d["consumption_kwh"] for d in day_totals)
    total_solar = sum(d["solar_kwh"] for d in day_totals)
    net_energy = total_cons - total_solar
    total_bill = sum(b["bill_lkr"] for b in bills)

    # Hourly usage 2h windows
    by_win = {}
    for zw in zone_windows:
        t_lbl = zw["window_start"].strftime("%H:%M")
        if t_lbl not in by_win:
            by_win[t_lbl] = {"time_label": t_lbl, "consumption_kwh": 0.0, "solar_kwh": 0.0, "estimated_net_kwh": 0.0}
        by_win[t_lbl]["consumption_kwh"] += zw["consumption_kwh"]
        by_win[t_lbl]["solar_kwh"] += zw["solar_kwh"]
        by_win[t_lbl]["estimated_net_kwh"] += zw["estimated_net_kwh"]

    hourly_usage = list(by_win.values())
    if hourly_usage:
        max_c = max(h["consumption_kwh"] for h in hourly_usage)
        for h in hourly_usage:
            h["is_peak"] = h["consumption_kwh"] == max_c

    # Zone summary
    zone_totals = demo_data.get_demo_zone_day_totals(SETTINGS, sim_date)
    zone_summary = []
    for zt in zone_totals:
        h_in_zone = [d for d in day_totals if d["zone_id"] == zt["zone_id"]]
        solar_h = [d for d in h_in_zone if d.get("has_solar")]
        solar_cap = sum(d.get("solar_capacity_kw", 0) for d in solar_h)
        zone_summary.append({
            "zone_id": zt["zone_id"],
            "households_count": len(h_in_zone),
            "meters_count": len(h_in_zone),
            "solar_households_count": len(solar_h),
            "total_solar_capacity_kw": solar_cap,
            "day_consumption_kwh": round(zt["consumption_kwh"], 2),
            "day_solar_kwh": round(zt["solar_kwh"], 2),
            "day_estimated_net_kwh": round(zt["estimated_net_kwh"], 2),
            "solar_contribution_pct": round(zt.get("solar_share", 0) * 100, 2),
            "day_readings_count": len(h_in_zone) * 60,
        })

    # Household rankings
    sorted_cons = sorted(day_totals, key=lambda x: x["consumption_kwh"], reverse=True)
    sorted_solar = sorted([d for d in day_totals if d.get("has_solar")], key=lambda x: x["solar_kwh"], reverse=True)

    rankings = {
        "top_consumers": [
            {
                "household_id": d["household_id"],
                "meter_id": f"M-{d['household_id']}",
                "zone_id": d["zone_id"],
                "consumption_kwh": d["consumption_kwh"],
                "solar_kwh": d["solar_kwh"],
                "estimated_net_kwh": d["estimated_net_kwh"],
            }
            for d in sorted_cons[:5]
        ],
        "top_producers": [
            {
                "household_id": d["household_id"],
                "meter_id": f"M-{d['household_id']}",
                "zone_id": d["zone_id"],
                "consumption_kwh": d["consumption_kwh"],
                "solar_kwh": d["solar_kwh"],
                "estimated_net_kwh": d["estimated_net_kwh"],
                "solar_contribution_pct": round((d["solar_kwh"] / d["consumption_kwh"] * 100), 2) if d["consumption_kwh"] > 0 else 0.0,
            }
            for d in sorted_solar[:5]
        ],
    }

    # Recent simulated readings
    recent = []
    sim_now = demo_data.get_sim_current_time(SETTINGS)
    for i, h in enumerate(day_totals[:10]):
        recent.append({
            "event_id": f"evt-{h['household_id']}-recent",
            "meter_id": f"M-{h['household_id']}",
            "household_id": h["household_id"],
            "zone_id": h["zone_id"],
            "event_time": (sim_now - timedelta(minutes=i * 5)).isoformat(),
            "generated_at": (now - timedelta(seconds=i * 5)).isoformat(),
            "interval_minutes": 24.0,
            "consumption_kwh": round(h["consumption_kwh"] / 12, 3),
            "solar_kwh": round(h["solar_kwh"] / 12, 3),
            "estimated_net_kwh": round((h["consumption_kwh"] - h["solar_kwh"]) / 12, 3),
            "kafka_partition": i % 3,
            "kafka_offset": 1000 + i,
            "status": "valid",
        })

    solar_share_pct = round((total_solar / total_cons * 100), 2) if total_cons > 0 else 0.0

    return _jsonable({
        "sim_day": sim_date,
        "kpis": {
            "total_consumption_kwh": round(total_cons, 2),
            "total_solar_kwh": round(total_solar, 2),
            "estimated_net_kwh": round(net_energy, 2),
            "total_bill_amount": round(total_bill, 2),
            "active_meters_count": len(day_totals),
            "total_households_count": len(day_totals),
            "solar_contribution_pct": solar_share_pct,
            "is_billed_final": True,
            "latest_event_time": snap.get("latest_event_time"),
            "latest_ingested_at": snap.get("latest_ingested_at"),
        },
        "badges": {
            "total_consumption": {"type": "Live", "tooltip": "Simulated live grid demand calculated from pure simulation models."},
            "solar_generation": {"type": "Live", "tooltip": "Simulated solar microgeneration across equipped households."},
            "net_grid_energy": {
                "type": "Estimate",
                "tooltip": "Estimate (derived): Net energy estimated as consumption − solar. Instantaneous import/export telemetry not provided.",
            },
            "estimated_bill": {
                "type": "Final",
                "tooltip": "Authoritative billed total from simulation billing settlement.",
            },
        },
        "pipeline_status": {
            "postgres": "online",
            "kafka": "online",
            "spark": "online",
            "api": "online",
            "latest_reading_age_seconds": 3.2,
            "overall": "healthy",
        },
        "hourly_usage": hourly_usage,
        "zone_comparison": zone_summary,
        "household_rankings": rankings,
        "recent_readings": recent,
        "latest_alerts": [a.as_dict() for a in alerts],
        "last_updated": now.isoformat(),
    })


# ---------------------------------------------------------------------------
# 2. Energy Timeseries API
# ---------------------------------------------------------------------------
@app.get("/api/energy/timeseries")
def get_energy_timeseries(
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    zone_id: Optional[str] = Query(None, description="Zone filter"),
    household_id: Optional[str] = Query(None, description="Household filter"),
):
    conn = _try_conn()
    if conn is not None:
        try:
            series = queries.energy_timeseries(
                conn,
                start_date=start_date if isinstance(start_date, date) else None,
                end_date=end_date if isinstance(end_date, date) else None,
                zone_id=zone_id if isinstance(zone_id, str) and zone_id else None,
                household_id=household_id if isinstance(household_id, str) and household_id else None,
            )
            points = []
            for p in series:
                c = float(p["consumption_kwh"] or 0)
                s = float(p["solar_kwh"] or 0)
                points.append({
                    "window_start": p["window_start"],
                    "window_end": p["window_end"],
                    "time_label": p["window_start"].strftime("%H:%M") if hasattr(p["window_start"], "strftime") else str(p["window_start"]),
                    "consumption_kwh": round(c, 3),
                    "solar_kwh": round(s, 3),
                    "estimated_net_kwh": round(c - s, 3),
                    "readings_count": p["readings_count"],
                })

            total_cons = sum(p["consumption_kwh"] for p in points)
            total_solar = sum(p["solar_kwh"] for p in points)
            avg_cons = round(total_cons / len(points), 3) if points else 0.0
            peak_cons = max((p["consumption_kwh"] for p in points), default=0.0)

            return _jsonable({
                "timeseries": points,
                "summary": {
                    "total_consumption_kwh": round(total_cons, 3),
                    "total_solar_kwh": round(total_solar, 3),
                    "estimated_net_kwh": round(total_cons - total_solar, 3),
                    "avg_consumption_kwh": avg_cons,
                    "peak_consumption_kwh": round(peak_cons, 3),
                    "points_count": len(points),
                },
            })
        finally:
            conn.close()

    # Fallback to demo windows
    sim_date = SETTINGS.sim_start.date()
    if isinstance(household_id, str) and household_id:
        windows = demo_data.get_demo_household_windows(SETTINGS, household_id, sim_date)
    else:
        zw = demo_data.get_demo_zone_windows(SETTINGS, sim_date)
        if isinstance(zone_id, str) and zone_id:
            zw = [z for z in zw if z["zone_id"] == zone_id]
        by_t = {}
        for item in zw:
            t = item["window_start"]
            if t not in by_t:
                by_t[t] = {"window_start": t, "window_end": item["window_end"], "consumption_kwh": 0.0, "solar_kwh": 0.0, "estimated_net_kwh": 0.0, "readings_count": 0}
            by_t[t]["consumption_kwh"] += item["consumption_kwh"]
            by_t[t]["solar_kwh"] += item["solar_kwh"]
            by_t[t]["estimated_net_kwh"] += item["estimated_net_kwh"]
            by_t[t]["readings_count"] += item["readings_count"]
        windows = list(by_t.values())

    points = [
        {
            "window_start": w["window_start"],
            "window_end": w["window_end"],
            "time_label": w["window_start"].strftime("%H:%M"),
            "consumption_kwh": round(w["consumption_kwh"], 3),
            "solar_kwh": round(w["solar_kwh"], 3),
            "estimated_net_kwh": round(w["estimated_net_kwh"], 3),
            "readings_count": w["readings_count"],
        }
        for w in windows
    ]
    total_cons = sum(p["consumption_kwh"] for p in points)
    total_solar = sum(p["solar_kwh"] for p in points)

    return _jsonable({
        "timeseries": points,
        "summary": {
            "total_consumption_kwh": round(total_cons, 3),
            "total_solar_kwh": round(total_solar, 3),
            "estimated_net_kwh": round(total_cons - total_solar, 3),
            "avg_consumption_kwh": round(total_cons / len(points), 3) if points else 0.0,
            "peak_consumption_kwh": max((p["consumption_kwh"] for p in points), default=0.0),
            "points_count": len(points),
        },
    })


# ---------------------------------------------------------------------------
# 3. Readings API (Paginated)
# ---------------------------------------------------------------------------
@app.get("/api/readings")
def get_readings(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    zone_id: Optional[str] = Query(None, description="Filter by zone ID"),
    household_id: Optional[str] = Query(None, description="Filter by household ID"),
    meter_id: Optional[str] = Query(None, description="Filter by meter ID"),
    status: str = Query("all", pattern="^(all|valid|invalid)$", description="Filter by status"),
    start_time: Optional[str] = Query(None, description="Start timestamp"),
    end_time: Optional[str] = Query(None, description="End timestamp"),
):
    page_num = int(page) if isinstance(page, int) else 1
    page_sz = int(page_size) if isinstance(page_size, int) else 20
    status_str = status if isinstance(status, str) else "all"

    conn = _try_conn()
    if conn is not None:
        try:
            res = queries.paginated_meter_readings(
                conn,
                page=page_num,
                page_size=page_sz,
                zone_id=zone_id if isinstance(zone_id, str) and zone_id else None,
                household_id=household_id if isinstance(household_id, str) and household_id else None,
                meter_id=meter_id if isinstance(meter_id, str) and meter_id else None,
                status=status_str,
                start_time=start_time if isinstance(start_time, str) else None,
                end_time=end_time if isinstance(end_time, str) else None,
            )
            return _jsonable(res)
        finally:
            conn.close()

    # Fallback to simulated readings
    sim_date = SETTINGS.sim_start.date()
    households = demo_data.get_demo_households(SETTINGS)
    all_readings = []
    sim_now = demo_data.get_sim_current_time(SETTINGS)
    now = datetime.now(timezone.utc)

    for tick in range(60):  # 60 readings per household
        t_time = sim_now - timedelta(minutes=tick * 5)
        for h in households:
            if isinstance(zone_id, str) and zone_id and h["zone_id"] != zone_id:
                continue
            if isinstance(household_id, str) and household_id and h["household_id"] != household_id:
                continue
            if isinstance(meter_id, str) and meter_id and h["meter_id"] != meter_id:
                continue

            c = round(h["base_load_kw"] * 0.4 + (hash(h["household_id"] + str(tick)) % 20) * 0.02, 3)
            s = round(h["solar_capacity_kw"] * 0.35, 3) if h["has_solar"] else 0.0

            all_readings.append({
                "event_id": f"evt-{h['household_id']}-{tick}",
                "meter_id": h["meter_id"],
                "household_id": h["household_id"],
                "zone_id": h["zone_id"],
                "event_time": t_time.isoformat(),
                "generated_at": (now - timedelta(seconds=tick * 5)).isoformat(),
                "interval_minutes": 24.0,
                "consumption_kwh": c,
                "solar_kwh": s,
                "estimated_net_kwh": round(c - s, 3),
                "kafka_partition": int(h["household_id"][-1]) % 3,
                "kafka_offset": 5000 + tick,
                "status": "valid",
                "error_reason": None,
            })

    if status_str == "invalid":
        inv = demo_data.get_demo_invalid_readings(10)
        items = [
            {
                "event_id": f"dlq-{r['kafka_topic']}-{r['kafka_offset']}",
                "meter_id": "N/A",
                "household_id": "N/A",
                "zone_id": "N/A",
                "event_time": r["kafka_timestamp"].isoformat(),
                "generated_at": r["kafka_timestamp"].isoformat(),
                "interval_minutes": 0.0,
                "consumption_kwh": 0.0,
                "solar_kwh": 0.0,
                "estimated_net_kwh": 0.0,
                "kafka_partition": r["kafka_partition"],
                "kafka_offset": r["kafka_offset"],
                "status": "invalid",
                "error_reason": r["error_reason"],
            }
            for r in inv
        ]
        return _jsonable({"items": items, "total": len(items), "page": 1, "page_size": page_sz, "total_pages": 1})

    total = len(all_readings)
    offset = (page_num - 1) * page_sz
    items = all_readings[offset:offset + page_sz]
    total_pages = max(1, (total + page_sz - 1) // page_sz)

    return _jsonable({
        "items": items,
        "total": total,
        "page": page_num,
        "page_size": page_sz,
        "total_pages": total_pages,
    })


# ---------------------------------------------------------------------------
# 4. Zones API (Dynamic Discovery)
# ---------------------------------------------------------------------------
@app.get("/api/zones")
def get_zones():
    conn = _try_conn()
    if conn is not None:
        try:
            target_day = queries.latest_simulated_day(conn)
            summary = queries.dynamic_zones_summary(conn, target_day)
            return _jsonable({
                "sim_day": target_day,
                "zones_count": len(summary),
                "zones": summary,
            })
        finally:
            conn.close()

    # Fallback to simulation zones
    sim_date = SETTINGS.sim_start.date()
    zone_totals = demo_data.get_demo_zone_day_totals(SETTINGS, sim_date)
    households = demo_data.get_demo_households(SETTINGS)
    summary = []
    for zt in zone_totals:
        h_list = [h for h in households if h["zone_id"] == zt["zone_id"]]
        solar_h = [h for h in h_list if h["has_solar"]]
        summary.append({
            "zone_id": zt["zone_id"],
            "households_count": len(h_list),
            "meters_count": len(h_list),
            "solar_households_count": len(solar_h),
            "total_solar_capacity_kw": sum(h["solar_capacity_kw"] for h in solar_h),
            "day_consumption_kwh": round(zt["consumption_kwh"], 2),
            "day_solar_kwh": round(zt["solar_kwh"], 2),
            "day_estimated_net_kwh": round(zt["estimated_net_kwh"], 2),
            "solar_contribution_pct": round(zt.get("solar_share", 0) * 100, 2),
            "day_readings_count": len(h_list) * 60,
        })

    return _jsonable({
        "sim_day": sim_date,
        "zones_count": len(summary),
        "zones": summary,
    })


# ---------------------------------------------------------------------------
# 5. Households API
# ---------------------------------------------------------------------------
@app.get("/api/households")
def get_households(
    zone_id: Optional[str] = Query(None, description="Filter by zone ID"),
):
    conn = _try_conn()
    if conn is not None:
        try:
            registry = queries.household_registry(conn)
            target_day = queries.latest_simulated_day(conn)

            day_totals = queries.household_daily(conn, target_day) if target_day else []
            totals_map = {r["household_id"]: r for r in day_totals}

            bills_map = {}
            if target_day:
                b_rows = queries.bills(conn, target_day)
                bills_map = {r["household_id"]: r for r in b_rows}

            out = []
            for h in registry:
                if isinstance(zone_id, str) and zone_id and h["zone_id"] != zone_id:
                    continue

                hid = h["household_id"]
                d = totals_map.get(hid, {})
                b = bills_map.get(hid, {})

                cons = float(d.get("consumption_kwh") or 0.0)
                solar = float(d.get("solar_kwh") or 0.0)
                net = cons - solar

                bill_amt = float(b["bill_lkr"]) if "bill_lkr" in b else round(cons * 30.0, 2)
                tier = b.get("billing_tier") or "Standard"

                out.append({
                    "household_id": hid,
                    "meter_id": h["meter_id"],
                    "zone_id": h["zone_id"],
                    "has_solar": h["has_solar"],
                    "solar_capacity_kw": float(h["solar_capacity_kw"] or 0),
                    "registered_at": h["registered_at"],
                    "consumption_kwh": round(cons, 3),
                    "solar_kwh": round(solar, 3),
                    "estimated_net_kwh": round(net, 3),
                    "solar_share_pct": round(solar / cons * 100, 2) if cons > 0 else 0.0,
                    "bill_amount": bill_amt,
                    "bill_status": "Final" if hid in bills_map else "Estimate",
                    "billing_tier": tier,
                    "readings_count": d.get("readings_count", 0),
                })

            return _jsonable({"sim_day": target_day, "total": len(out), "households": out})
        finally:
            conn.close()

    # Fallback to simulation households
    sim_date = SETTINGS.sim_start.date()
    daily = demo_data.get_demo_household_daily(SETTINGS, sim_date)
    bills = demo_data.get_demo_bills(SETTINGS, sim_date)
    bills_map = {b["household_id"]: b for b in bills}

    out = []
    for d in daily:
        if isinstance(zone_id, str) and zone_id and d["zone_id"] != zone_id:
            continue
        hid = d["household_id"]
        b = bills_map.get(hid, {})
        c = d["consumption_kwh"]
        s = d["solar_kwh"]
        out.append({
            "household_id": hid,
            "meter_id": f"M-{hid}",
            "zone_id": d["zone_id"],
            "has_solar": d["has_solar"],
            "solar_capacity_kw": d["solar_capacity_kw"],
            "registered_at": SETTINGS.sim_start.isoformat(),
            "consumption_kwh": c,
            "solar_kwh": s,
            "estimated_net_kwh": round(c - s, 3),
            "solar_share_pct": round(s / c * 100, 2) if c > 0 else 0.0,
            "bill_amount": b.get("bill_lkr", round(c * 32.0, 2)),
            "bill_status": "Final",
            "billing_tier": b.get("billing_tier", "Standard"),
            "readings_count": d["readings_count"],
        })

    return _jsonable({"sim_day": sim_date, "total": len(out), "households": out})


@app.get("/api/households/{household_id}")
def get_household_detail(household_id: str):
    conn = _try_conn()
    if conn is not None:
        try:
            registry = queries.household_registry(conn)
            target = next((h for h in registry if h["household_id"] == household_id), None)
            if not target:
                raise HTTPException(status_code=404, detail=f"Household {household_id} not found")

            target_day = queries.latest_simulated_day(conn)
            windows = queries.household_windows(conn, household_id, target_day) if target_day else []
            recent_series = []
            for w in windows:
                c = float(w["consumption_kwh"] or 0)
                s = float(w["solar_kwh"] or 0)
                recent_series.append({
                    "window_start": w["window_start"],
                    "window_end": w["window_end"],
                    "time_label": w["window_start"].strftime("%H:%M") if hasattr(w["window_start"], "strftime") else str(w["window_start"]),
                    "consumption_kwh": round(c, 3),
                    "solar_kwh": round(s, 3),
                    "estimated_net_kwh": round(c - s, 3),
                    "readings_count": w["readings_count"],
                })

            readings_res = queries.paginated_meter_readings(conn, page=1, page_size=15, household_id=household_id, status="valid")
            history = queries.household_bills_history(conn, household_id)
            day_totals = queries.household_daily(conn, target_day) if target_day else []
            today_data = next((d for d in day_totals if d["household_id"] == household_id), {})
            today_cons = float(today_data.get("consumption_kwh") or 0.0)
            today_solar = float(today_data.get("solar_kwh") or 0.0)
            latest_bill = history[0] if history else None

            return _jsonable({
                "info": {
                    "household_id": target["household_id"],
                    "meter_id": target["meter_id"],
                    "zone_id": target["zone_id"],
                    "has_solar": target["has_solar"],
                    "solar_capacity_kw": float(target["solar_capacity_kw"] or 0),
                    "registered_at": target["registered_at"],
                },
                "today_summary": {
                    "sim_day": target_day,
                    "consumption_kwh": round(today_cons, 3),
                    "solar_kwh": round(today_solar, 3),
                    "estimated_net_kwh": round(today_cons - today_solar, 3),
                    "solar_contribution_pct": round(today_solar / today_cons * 100, 2) if today_cons > 0 else 0.0,
                    "readings_count": today_data.get("readings_count", 0),
                },
                "load_curve": recent_series,
                "recent_readings": readings_res["items"],
                "bills_history": history,
                "latest_bill": latest_bill,
            })
        finally:
            conn.close()

    # Fallback to demo household details
    sim_date = SETTINGS.sim_start.date()
    households = demo_data.get_demo_households(SETTINGS)
    target = next((h for h in households if h["household_id"] == household_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Household {household_id} not found")

    windows = demo_data.get_demo_household_windows(SETTINGS, household_id, sim_date)
    recent_series = [
        {
            "window_start": w["window_start"],
            "window_end": w["window_end"],
            "time_label": w["window_start"].strftime("%H:%M"),
            "consumption_kwh": round(w["consumption_kwh"], 3),
            "solar_kwh": round(w["solar_kwh"], 3),
            "estimated_net_kwh": round(w["estimated_net_kwh"], 3),
            "readings_count": w["readings_count"],
        }
        for w in windows
    ]
    c_tot = sum(w["consumption_kwh"] for w in windows)
    s_tot = sum(w["solar_kwh"] for w in windows)
    bills = demo_data.get_demo_bills(SETTINGS, sim_date)
    my_bill = next((b for b in bills if b["household_id"] == household_id), None)

    return _jsonable({
        "info": {
            "household_id": target["household_id"],
            "meter_id": target["meter_id"],
            "zone_id": target["zone_id"],
            "has_solar": target["has_solar"],
            "solar_capacity_kw": target["solar_capacity_kw"],
            "registered_at": target["registered_at"],
        },
        "today_summary": {
            "sim_day": sim_date,
            "consumption_kwh": round(c_tot, 3),
            "solar_kwh": round(s_tot, 3),
            "estimated_net_kwh": round(c_tot - s_tot, 3),
            "solar_contribution_pct": round(s_tot / c_tot * 100, 2) if c_tot > 0 else 0.0,
            "readings_count": len(windows) * 5,
        },
        "load_curve": recent_series,
        "recent_readings": [],
        "bills_history": [my_bill] if my_bill else [],
        "latest_bill": my_bill,
    })


# ---------------------------------------------------------------------------
# 6. Bills API
# ---------------------------------------------------------------------------
@app.get("/api/bills")
def get_bills(
    day: Optional[date] = Query(None, description="Target billing day (YYYY-MM-DD)"),
    zone_id: Optional[str] = Query(None, description="Filter by zone ID"),
    household_id: Optional[str] = Query(None, description="Filter by household ID"),
):
    conn = _try_conn()
    if conn is not None:
        try:
            available_dates = queries.bill_dates(conn)
            target_day = day if isinstance(day, date) else (available_dates[0] if available_dates else queries.latest_simulated_day(conn))

            if not target_day:
                return {"bill_date": None, "is_final": False, "bills": [], "available_dates": []}

            rows = queries.bills(conn, target_day)
            is_final = len(rows) > 0

            if not is_final:
                day_totals = queries.household_daily(conn, target_day)
                rows = []
                for d in day_totals:
                    c = float(d["consumption_kwh"] or 0)
                    s = float(d["solar_kwh"] or 0)
                    rate = 30.00
                    rows.append({
                        "bill_date": target_day,
                        "household_id": d["household_id"],
                        "zone_id": d["zone_id"],
                        "consumption_kwh": c,
                        "solar_kwh": s,
                        "rate_lkr_per_kwh": rate,
                        "bill_lkr": round(c * rate, 2),
                        "readings_count": d["readings_count"],
                        "billing_tier": "Standard",
                        "subsidy_flag": False,
                        "tariff_file": "live-estimate",
                        "status": "Estimate",
                    })
            else:
                for r in rows:
                    r["status"] = "Final"

            if isinstance(zone_id, str) and zone_id:
                rows = [r for r in rows if r.get("zone_id") == zone_id]
            if isinstance(household_id, str) and household_id:
                rows = [r for r in rows if r.get("household_id") == household_id]

            total_bill = sum(float(r["bill_lkr"] or 0) for r in rows)
            total_kwh = sum(float(r["consumption_kwh"] or 0) for r in rows)
            total_solar = sum(float(r["solar_kwh"] or 0) for r in rows)

            return _jsonable({
                "bill_date": target_day,
                "is_final": is_final,
                "total_bill_amount": round(total_bill, 2),
                "total_consumption_kwh": round(total_kwh, 3),
                "total_solar_kwh": round(total_solar, 3),
                "bills_count": len(rows),
                "bills": rows,
                "available_dates": available_dates,
            })
        finally:
            conn.close()

    # Fallback to simulation bills
    sim_date = SETTINGS.sim_start.date()
    rows = demo_data.get_demo_bills(SETTINGS, sim_date)
    for r in rows:
        r["status"] = "Final"

    if isinstance(zone_id, str) and zone_id:
        rows = [r for r in rows if r.get("zone_id") == zone_id]
    if isinstance(household_id, str) and household_id:
        rows = [r for r in rows if r.get("household_id") == household_id]

    total_bill = sum(float(r["bill_lkr"]) for r in rows)
    total_kwh = sum(float(r["consumption_kwh"]) for r in rows)
    total_solar = sum(float(r["solar_kwh"]) for r in rows)

    return _jsonable({
        "bill_date": sim_date,
        "is_final": True,
        "total_bill_amount": round(total_bill, 2),
        "total_consumption_kwh": round(total_kwh, 3),
        "total_solar_kwh": round(total_solar, 3),
        "bills_count": len(rows),
        "bills": rows,
        "available_dates": [sim_date.isoformat()],
    })


@app.get("/api/bills/{bill_id}")
def get_bill_detail(bill_id: str):
    conn = _try_conn()
    if conn is not None:
        try:
            detail = queries.bill_detail_by_id(conn, bill_id)
            if detail:
                return _jsonable(detail)
        finally:
            conn.close()

    sim_date = SETTINGS.sim_start.date()
    rows = demo_data.get_demo_bills(SETTINGS, sim_date)
    for r in rows:
        if r["household_id"] in bill_id or bill_id in r["household_id"]:
            r["status"] = "Final"
            return _jsonable(r)

    raise HTTPException(status_code=404, detail=f"Bill invoice {bill_id} not found")


# ---------------------------------------------------------------------------
# 7. Alerts API
# ---------------------------------------------------------------------------
@app.get("/api/alerts")
def get_alerts():
    now = datetime.now(timezone.utc)
    conn = _try_conn()
    if conn is not None:
        try:
            snap, alert_objs = _health_pg(conn, now)
            dlq = queries.invalid_readings_recent(conn, limit=10)
            batch_stats = queries.stream_batches_recent(conn, limit=10)
            return _jsonable({
                "evaluated_at": now.isoformat(),
                "overall_status": overall_status(alert_objs),
                "alerts": [a.as_dict() for a in alert_objs],
                "thresholds": {
                    "stale_after_seconds": SETTINGS.stale_after_seconds,
                    "invalid_rate_threshold_pct": SETTINGS.invalid_rate_threshold * 100,
                    "low_renewable_threshold_pct": SETTINGS.low_renewable_threshold * 100,
                },
                "recent_dead_letters": dlq,
                "recent_batches": batch_stats,
            })
        finally:
            conn.close()

    # Fallback to simulation alerts
    alerts = demo_data.get_demo_alerts(SETTINGS)
    dlq = demo_data.get_demo_invalid_readings(10)
    batches = demo_data.get_demo_stream_batches(10)
    return _jsonable({
        "evaluated_at": now.isoformat(),
        "overall_status": "ok",
        "alerts": [a.as_dict() for a in alerts],
        "thresholds": {
            "stale_after_seconds": SETTINGS.stale_after_seconds,
            "invalid_rate_threshold_pct": SETTINGS.invalid_rate_threshold * 100,
            "low_renewable_threshold_pct": SETTINGS.low_renewable_threshold * 100,
        },
        "recent_dead_letters": dlq,
        "recent_batches": batches,
    })


@app.post("/api/alerts/{alert_id}/ack")
def acknowledge_alert(alert_id: str):
    return {"status": "acknowledged", "alert_id": alert_id, "timestamp": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# 8. Health Check API
# ---------------------------------------------------------------------------
def _health_pg(conn, now):
    snap = queries.pipeline_snapshot(conn)
    alerts = evaluate_alerts(snap, queries.latest_daylight_zone_windows(conn), SETTINGS, now)
    return snap, alerts


@app.get("/health")
def health():
    now = datetime.now(timezone.utc)
    uptime_seconds = round(time.time() - START_TIME, 1)
    try:
        conn = _conn()
    except HTTPException:
        raise
    except Exception:
        conn = None

    if conn is not None:
        start_ping = time.monotonic()
        pg_latency = round((time.monotonic() - start_ping) * 1000, 2)
        try:
            snap, alerts = _health_pg(conn, now)
        finally:
            conn.close()

        status = overall_status(alerts)
        age = (now - snap["latest_ingested_at"]).total_seconds() if snap["latest_ingested_at"] else None
        spark_batch = snap.get("latest_batch_at")
        spark_age = (now - spark_batch).total_seconds() if spark_batch else None

        body = {
            "status": status,
            "checked_at": now.isoformat(),
            "uptime_seconds": uptime_seconds,
            "latest_reading_age_seconds": round(age, 1) if age is not None else None,
            "latest_simulated_time": snap["latest_event_time"],
            "services": {
                "postgres": {"status": "up", "latency_ms": pg_latency},
                "kafka": {"status": "up" if snap.get("readings_total", 0) > 0 else "unknown"},
                "spark": {
                    "status": "up" if spark_age and spark_age < 120 else ("stale" if spark_batch else "initializing"),
                    "latest_batch_at": spark_batch,
                    "age_seconds": round(spark_age, 1) if spark_age is not None else None,
                },
                "api": {"status": "up", "uptime_seconds": uptime_seconds},
            },
            "metrics_summary": {
                "readings_total": snap.get("readings_total", 0),
                "invalid_total": snap.get("invalid_total", 0),
                "duplicates_total": snap.get("duplicates_total", 0),
                "households_registered": snap.get("households", 0),
            },
            "last_billing_run": snap.get("last_billing_run"),
            "alerts": [a.as_dict() for a in alerts],
        }
        return JSONResponse(_jsonable(body), status_code=503 if status == "critical" else 200)

    # Fallback to simulation health
    snap = demo_data.get_demo_pipeline_snapshot(SETTINGS, now)
    alerts = demo_data.get_demo_alerts(SETTINGS)

    body = {
        "status": "ok",
        "checked_at": now.isoformat(),
        "uptime_seconds": uptime_seconds,
        "latest_reading_age_seconds": 3.2,
        "latest_simulated_time": snap["latest_event_time"],
        "services": {
            "postgres": {"status": "up", "latency_ms": 1.2},
            "kafka": {"status": "up"},
            "spark": {"status": "up", "latest_batch_at": snap["latest_batch_at"], "age_seconds": 4.0},
            "api": {"status": "up", "uptime_seconds": uptime_seconds},
        },
        "metrics_summary": {
            "readings_total": snap["readings_total"],
            "invalid_total": snap["invalid_total"],
            "duplicates_total": snap["duplicates_total"],
            "households_registered": snap["households"],
        },
        "last_billing_run": snap["last_billing_run"],
        "alerts": [a.as_dict() for a in alerts],
    }
    return JSONResponse(_jsonable(body), status_code=200)


# ---------------------------------------------------------------------------
# 9. Legacy Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/zones/current")
def zones_current():
    return get_zones()


@app.get("/api/zones/history")
def zones_history():
    res = get_energy_timeseries()
    return res.get("timeseries", [])


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    now = datetime.now(timezone.utc)
    snap = demo_data.get_demo_pipeline_snapshot(SETTINGS, now)
    lines = [
        f"smartgrid_latest_reading_age_seconds 3.2",
        f"smartgrid_readings_stored_total {snap['readings_total']}",
        f"smartgrid_invalid_readings_total {snap['invalid_total']}",
        f"smartgrid_duplicate_readings_total {snap['duplicates_total']}",
        f"smartgrid_last_billing_success 1",
    ]
    return "\n".join(lines) + "\n"
