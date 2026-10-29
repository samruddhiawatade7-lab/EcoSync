"""Realistic simulation / mock data provider for the Streamlit dashboard.

Used when PostgreSQL is not yet running or still waiting for initial readings,
ensuring the dashboard is immediately interactive, testable, and demonstrable.
Uses the exact same pure simulation math and seed as the backend simulator.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from smartgrid.alerts import Alert
from smartgrid.config import Settings
from smartgrid.simulation import build_households, demand_profile, solar_profile


def get_sim_current_time(settings: Settings, offset_hours: float = 14.5) -> datetime:
    """Return a simulated timestamp in mid-afternoon of Day 1 (or current clock)."""
    return settings.sim_start + timedelta(hours=offset_hours)


def get_demo_households(settings: Settings) -> list[dict[str, Any]]:
    hh_objects = build_households(settings)
    return [
        {
            "household_id": h.household_id,
            "meter_id": h.meter_id,
            "zone_id": h.zone_id,
            "has_solar": h.has_solar,
            "solar_capacity_kw": h.solar_capacity_kw,
            "base_load_kw": h.base_load_kw,
            "registered_at": settings.sim_start,
        }
        for h in hh_objects
    ]


def get_demo_household_windows(
    settings: Settings, household_id: str, sim_date: date
) -> list[dict[str, Any]]:
    hh_map = {h["household_id"]: h for h in get_demo_households(settings)}
    h = hh_map.get(household_id)
    if not h:
        return []

    windows = []
    base_dt = datetime.combine(sim_date, datetime.min.time(), tzinfo=timezone.utc)
    base_kw = h["base_load_kw"]
    solar_cap = h["solar_capacity_kw"]

    for w in range(12):  # 12 windows of 2 hours = 24 hours
        w_start = base_dt + timedelta(hours=w * 2)
        w_end = w_start + timedelta(hours=2)
        mid_hour = w * 2 + 1.0

        # Demand over 2h window (kWh = power * 2 hours)
        d_mult = demand_profile(mid_hour)
        # Small variance based on household id hash
        h_noise = 1.0 + (hash(household_id + str(w)) % 21 - 10) * 0.015
        consumption_kwh = round(base_kw * d_mult * 2.0 * h_noise, 4)

        # Solar over 2h window
        s_rad = solar_profile(mid_hour)
        cloud_factor = 0.85 if h["zone_id"] != "Z3" else 0.45  # Zone 3 cloudy day
        solar_kwh = round(solar_cap * s_rad * cloud_factor * 2.0, 4) if solar_cap > 0 else 0.0

        windows.append(
            {
                "household_id": household_id,
                "zone_id": h["zone_id"],
                "window_start": w_start,
                "window_end": w_end,
                "consumption_kwh": max(0.01, consumption_kwh),
                "solar_kwh": max(0.0, solar_kwh),
                "estimated_net_kwh": round(consumption_kwh - solar_kwh, 4),
                "readings_count": 5,  # 5 ticks of 24 min in 2 h
            }
        )
    return windows


def get_demo_zone_windows(settings: Settings, sim_date: date) -> list[dict[str, Any]]:
    all_households = get_demo_households(settings)
    zone_windows_map: dict[tuple[str, datetime], dict[str, Any]] = {}

    for h in all_households:
        hw_list = get_demo_household_windows(settings, h["household_id"], sim_date)
        for hw in hw_list:
            key = (hw["zone_id"], hw["window_start"])
            if key not in zone_windows_map:
                zone_windows_map[key] = {
                    "zone_id": hw["zone_id"],
                    "window_start": hw["window_start"],
                    "window_end": hw["window_end"],
                    "consumption_kwh": 0.0,
                    "solar_kwh": 0.0,
                    "estimated_net_kwh": 0.0,
                    "readings_count": 0,
                    "households": 0,
                }
            entry = zone_windows_map[key]
            entry["consumption_kwh"] += hw["consumption_kwh"]
            entry["solar_kwh"] += hw["solar_kwh"]
            entry["estimated_net_kwh"] += hw["estimated_net_kwh"]
            entry["readings_count"] += hw["readings_count"]
            entry["households"] += 1

    result = list(zone_windows_map.values())
    result.sort(key=lambda x: (x["window_start"], x["zone_id"]))
    return result


def get_demo_zone_day_totals(settings: Settings, sim_date: date) -> list[dict[str, Any]]:
    zw = get_demo_zone_windows(settings, sim_date)
    zone_totals: dict[str, dict[str, Any]] = {}
    for z in settings.zone_ids:
        zone_totals[z] = {
            "zone_id": z,
            "consumption_kwh": 0.0,
            "solar_kwh": 0.0,
            "estimated_net_kwh": 0.0,
            "solar_share": 0.0,
        }

    for item in zw:
        zid = item["zone_id"]
        if zid in zone_totals:
            zone_totals[zid]["consumption_kwh"] += item["consumption_kwh"]
            zone_totals[zid]["solar_kwh"] += item["solar_kwh"]
            zone_totals[zid]["estimated_net_kwh"] += item["estimated_net_kwh"]

    for zid, zdata in zone_totals.items():
        if zdata["consumption_kwh"] > 0:
            zdata["solar_share"] = zdata["solar_kwh"] / zdata["consumption_kwh"]

    return list(zone_totals.values())


def get_demo_household_daily(settings: Settings, sim_date: date) -> list[dict[str, Any]]:
    households = get_demo_households(settings)
    rows = []
    for h in households:
        windows = get_demo_household_windows(settings, h["household_id"], sim_date)
        c_sum = sum(w["consumption_kwh"] for w in windows)
        s_sum = sum(w["solar_kwh"] for w in windows)
        rows.append(
            {
                "household_id": h["household_id"],
                "zone_id": h["zone_id"],
                "consumption_kwh": round(c_sum, 3),
                "solar_kwh": round(s_sum, 3),
                "estimated_net_kwh": round(c_sum - s_sum, 3),
                "readings_count": len(windows) * 5,
                "has_solar": h["has_solar"],
                "solar_capacity_kw": h["solar_capacity_kw"],
            }
        )
    return rows


def get_demo_bills(settings: Settings, sim_date: date) -> list[dict[str, Any]]:
    daily = get_demo_household_daily(settings, sim_date)
    bills = []
    rates = {
        "H001": (32.50, "Tier 2 (General)", False),
        "H002": (28.00, "Tier 1 (Subsidized)", True),
        "H003": (35.00, "Tier 2 (General)", False),
        "H004": (42.00, "Tier 3 (High Demand)", False),
        "H005": (28.00, "Tier 1 (Subsidized)", True),
        "H006": (35.00, "Tier 2 (General)", False),
        "H007": (32.50, "Tier 2 (General)", False),
        "H008": (45.00, "Tier 3 (High Demand)", False),
        "H009": (28.00, "Tier 1 (Subsidized)", True),
        "H010": (35.00, "Tier 2 (General)", False),
        "H011": (32.50, "Tier 2 (General)", False),
        "H012": (38.00, "Tier 2 (General)", False),
    }

    for row in daily:
        hid = row["household_id"]
        rate, tier, subsidized = rates.get(hid, (33.00, "Tier 2 (General)", False))
        c_kwh = row["consumption_kwh"]
        s_kwh = row["solar_kwh"]
        bill = round(c_kwh * rate, 2)
        share = round((s_kwh / c_kwh * 100), 2) if c_kwh > 0 else 0.0
        bills.append(
            {
                "bill_date": sim_date,
                "household_id": hid,
                "zone_id": row["zone_id"],
                "consumption_kwh": c_kwh,
                "solar_kwh": s_kwh,
                "solar_share_pct": share,
                "estimated_net_kwh": round(c_kwh - s_kwh, 4),
                "rate_lkr_per_kwh": rate,
                "bill_lkr": bill,
                "readings_count": row["readings_count"],
                "billing_tier": tier,
                "subsidy_flag": subsidized,
                "tariff_file": f"tariffs_{sim_date}.csv",
                "computed_at": datetime.now(timezone.utc),
            }
        )
    return bills


def get_demo_pipeline_snapshot(settings: Settings, now: datetime) -> dict[str, Any]:
    sim_now = get_sim_current_time(settings)
    return {
        "latest_ingested_at": now - timedelta(seconds=3.2),
        "latest_event_time": sim_now,
        "readings_total": 1440,
        "invalid_total": 14,
        "duplicates_total": 29,
        "recent_valid": 118,
        "recent_invalid": 2,
        "latest_batch_at": now - timedelta(seconds=4.0),
        "households": 12,
        "last_billing_run": {
            "tariff_file": f"tariffs_{settings.sim_start.date()}.csv",
            "bill_date": settings.sim_start.date(),
            "status": "success",
            "households_billed": 12,
            "total_bill_lkr": 4820.50,
            "speed_layer_max_diff_kwh": 0.0004,
            "message": "12 households billed successfully",
            "run_id": "airflow_manual__2026-01-01",
            "finished_at": now - timedelta(minutes=15),
        },
        "latest_reading": {
            "event_id": "e7b0c341-9a11-4cb7-a50d-8df7d9b40012",
            "meter_id": "M-H004",
            "household_id": "H004",
            "zone_id": "Z1",
            "event_time": sim_now,
            "generated_at": now - timedelta(seconds=3.2),
            "interval_minutes": 24.0,
            "consumption_kwh": 0.384,
            "solar_kwh": 0.420,
            "ingested_at": now - timedelta(seconds=3.1),
        },
    }


def get_demo_stream_batches(limit: int = 20) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    batches = []
    for i in range(limit):
        t = now - timedelta(seconds=i * 10)
        input_rows = 12 if (i % 5 != 0) else 13
        dup_rows = 1 if (i % 7 == 0) else 0
        inv_rows = 1 if (i == 3 or i == 12) else 0
        valid = input_rows - inv_rows
        batches.append(
            {
                "query_name": "readings_sink",
                "batch_id": 1050 - i,
                "input_rows": input_rows,
                "valid_rows": valid,
                "invalid_rows": inv_rows,
                "inserted_rows": valid - dup_rows,
                "duplicate_rows": dup_rows,
                "duration_ms": int(180 + 35 * math.sin(i * 0.8)),
                "processed_at": t,
            }
        )
    return batches


def get_demo_invalid_readings(limit: int = 15) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    errors = [
        (
            "json_malformed",
            '{"event_id": "bad-uuid", "meter_id": "M-H007", "consumption_kwh": 0.41 ... truncated}',
        ),
        (
            "negative_kwh",
            '{"event_id": "a98f-001", "household_id": "H002", "consumption_kwh": -1.25, "solar_kwh": 0.0}',
        ),
        (
            "missing_field_event_time",
            '{"meter_id": "M-H011", "household_id": "H011", "zone_id": "Z2", "consumption_kwh": 0.32}',
        ),
        (
            "timezone_missing",
            '{"event_id": "c12d-445", "event_time": "2026-01-01T12:00:00", "consumption_kwh": 0.50}',
        ),
    ]
    records = []
    for i in range(min(limit, len(errors) * 3)):
        err_type, raw = errors[i % len(errors)]
        records.append(
            {
                "kafka_topic": "meter-readings",
                "kafka_partition": i % 3,
                "kafka_offset": 8200 + i * 45,
                "error_reason": err_type,
                "raw_value": raw,
                "kafka_timestamp": now - timedelta(minutes=i * 6 + 2),
                "ingested_at": now - timedelta(minutes=i * 6 + 2),
            }
        )
    return records


def get_demo_alerts(settings: Any = None) -> list[Alert]:
    return [
        Alert(
            name="low_renewable",
            severity="warning",
            message="Zone Z3 solar share 7.8% in daylight window starting 10:00 UTC (cloudy day threshold 10%).",
        )
    ]
