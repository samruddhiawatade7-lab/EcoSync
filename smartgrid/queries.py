"""Read-side queries used by the Streamlit dashboard and the FastAPI service."""

from __future__ import annotations

from datetime import date

from smartgrid.alerts import DAYLIGHT_HOURS
from smartgrid.db import fetch_dicts


def pipeline_snapshot(conn) -> dict:
    snap = fetch_dicts(
        conn,
        """
        SELECT
          (SELECT max(ingested_at) FROM meter_readings)                                AS latest_ingested_at,
          (SELECT max(event_time) FROM meter_readings)                                 AS latest_event_time,
          (SELECT count(*) FROM meter_readings)                                        AS readings_total,
          (SELECT count(*) FROM invalid_readings)                                      AS invalid_total,
          (SELECT count(*) FROM meter_readings WHERE ingested_at > now() - interval '5 minutes')   AS recent_valid,
          (SELECT count(*) FROM invalid_readings WHERE ingested_at > now() - interval '5 minutes') AS recent_invalid,
          (SELECT coalesce(sum(duplicate_rows), 0) FROM stream_batches WHERE query_name = 'readings_sink')
                                                                                       AS duplicates_total,
          (SELECT max(processed_at) FROM stream_batches)                               AS latest_batch_at,
          (SELECT count(*) FROM households)                                            AS households
        """,
    )[0]
    last = fetch_dicts(
        conn,
        """SELECT tariff_file, bill_date, status, households_billed, total_bill_lkr,
                  speed_layer_max_diff_kwh, message, run_id, finished_at
           FROM billing_runs ORDER BY id DESC LIMIT 1""",
    )
    snap["last_billing_run"] = last[0] if last else None
    latest = fetch_dicts(conn, "SELECT * FROM meter_readings ORDER BY ingested_at DESC, event_time DESC LIMIT 1")
    snap["latest_reading"] = latest[0] if latest else None
    return snap


def zone_windows(conn, day: date) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT zone_id, window_start, window_end, consumption_kwh, solar_kwh, estimated_net_kwh,
                  readings_count, households
           FROM zone_window_totals
           WHERE window_start >= %s::date AND window_start < %s::date + 1
           ORDER BY window_start, zone_id""",
        (day, day),
    )


def zone_day_totals(conn, day: date) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT zone_id, SUM(consumption_kwh) AS consumption_kwh, SUM(solar_kwh) AS solar_kwh,
                  SUM(estimated_net_kwh) AS estimated_net_kwh,
                  CASE WHEN SUM(consumption_kwh) > 0 THEN SUM(solar_kwh) / SUM(consumption_kwh) END AS solar_share
           FROM household_daily_totals WHERE sim_day = %s
           GROUP BY zone_id ORDER BY zone_id""",
        (day,),
    )


def latest_zone_windows(conn) -> list[dict]:
    """Most recent (possibly still open) window per zone - the 'current grid load'."""
    return fetch_dicts(
        conn,
        """SELECT DISTINCT ON (zone_id) zone_id, window_start, window_end, consumption_kwh, solar_kwh,
                  estimated_net_kwh, readings_count
           FROM zone_window_totals ORDER BY zone_id, window_start DESC""",
    )


def latest_daylight_zone_windows(conn) -> list[dict]:
    """Latest daylight (10:00-14:00 simulated) window per zone, used by the low-renewable alert."""
    lo, hi = DAYLIGHT_HOURS
    return fetch_dicts(
        conn,
        """SELECT DISTINCT ON (zone_id) zone_id, window_start, consumption_kwh, solar_kwh
           FROM zone_window_totals
           WHERE extract(hour FROM window_start AT TIME ZONE 'UTC') >= %s
             AND extract(hour FROM window_start AT TIME ZONE 'UTC') < %s
           ORDER BY zone_id, window_start DESC""",
        (lo, hi),
    )


def household_daily(conn, day: date) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT household_id, zone_id, consumption_kwh, solar_kwh, estimated_net_kwh, readings_count
           FROM household_daily_totals WHERE sim_day = %s ORDER BY household_id""",
        (day,),
    )


def bill_dates(conn) -> list[date]:
    return [r["bill_date"] for r in fetch_dicts(
        conn, "SELECT DISTINCT bill_date FROM household_bills ORDER BY bill_date DESC")]


def bills(conn, day: date) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT bill_date, household_id, zone_id, consumption_kwh, solar_kwh,
                  CASE WHEN consumption_kwh > 0 THEN round(solar_kwh / consumption_kwh * 100, 2) ELSE 0 END
                      AS solar_share_pct,
                  consumption_kwh - solar_kwh AS estimated_net_kwh,
                  rate_lkr_per_kwh, bill_lkr, readings_count, billing_tier, subsidy_flag, tariff_file, computed_at
           FROM household_bills WHERE bill_date = %s ORDER BY household_id""",
        (day,),
    )


def recent_billing_runs(conn, limit: int = 10) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT finished_at, tariff_file, bill_date, status, households_billed, total_bill_lkr,
                  speed_layer_max_diff_kwh, message
           FROM billing_runs ORDER BY id DESC LIMIT %s""",
        (limit,),
    )


def household_registry(conn) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT household_id, meter_id, zone_id, has_solar, solar_capacity_kw, registered_at
           FROM households ORDER BY household_id""",
    )


def household_windows(conn, household_id: str, day: date) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT household_id, zone_id, window_start, window_end, consumption_kwh, solar_kwh,
                  consumption_kwh - solar_kwh AS estimated_net_kwh, readings_count
           FROM household_window_usage
           WHERE household_id = %s
             AND window_start >= %s::date AND window_start < %s::date + 1
           ORDER BY window_start""",
        (household_id, day, day),
    )


def stream_batches_recent(conn, limit: int = 30) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT query_name, batch_id, input_rows, valid_rows, invalid_rows, inserted_rows,
                  duplicate_rows, max_event_time, duration_ms, processed_at
           FROM stream_batches ORDER BY processed_at DESC LIMIT %s""",
        (limit,),
    )


def invalid_readings_recent(conn, limit: int = 25) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT kafka_topic, kafka_partition, kafka_offset, raw_value, error_reason,
                  kafka_timestamp, ingested_at
           FROM invalid_readings ORDER BY ingested_at DESC LIMIT %s""",
        (limit,),
    )


def tariff_files_processed(conn) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT file_name, file_sha256, bill_date, processed_at
           FROM processed_tariff_files ORDER BY processed_at DESC""",
    )


def latest_simulated_day(conn) -> date | None:
    rows = fetch_dicts(conn, "SELECT max(event_time)::date AS day FROM meter_readings")
    if rows and rows[0]["day"]:
        return rows[0]["day"]
    # Fallback to max window_start from household_window_usage
    w_rows = fetch_dicts(conn, "SELECT max(window_start)::date AS day FROM household_window_usage")
    if w_rows and w_rows[0]["day"]:
        return w_rows[0]["day"]
    return None


def dynamic_zones_summary(conn, target_day: date | None = None) -> list[dict]:
    """Dynamically discover zones from households registry and aggregate metrics."""
    if target_day is None:
        target_day = latest_simulated_day(conn)

    sql = """
    WITH zone_registry AS (
        SELECT zone_id,
               count(*) AS households_count,
               count(DISTINCT meter_id) AS meters_count,
               coalesce(sum(CASE WHEN has_solar THEN 1 ELSE 0 END), 0) AS solar_households_count,
               coalesce(sum(solar_capacity_kw), 0.0) AS total_solar_capacity_kw
        FROM households
        GROUP BY zone_id
    ),
    zone_usage AS (
        SELECT zone_id,
               coalesce(sum(consumption_kwh), 0.0) AS day_consumption_kwh,
               coalesce(sum(solar_kwh), 0.0) AS day_solar_kwh,
               coalesce(sum(readings_count), 0) AS day_readings_count
        FROM household_daily_totals
        WHERE sim_day = %(target_day)s
        GROUP BY zone_id
    )
    SELECT r.zone_id,
           r.households_count,
           r.meters_count,
           r.solar_households_count,
           r.total_solar_capacity_kw,
           coalesce(u.day_consumption_kwh, 0.0) AS day_consumption_kwh,
           coalesce(u.day_solar_kwh, 0.0) AS day_solar_kwh,
           coalesce(u.day_consumption_kwh, 0.0) - coalesce(u.day_solar_kwh, 0.0) AS day_estimated_net_kwh,
           CASE
               WHEN coalesce(u.day_consumption_kwh, 0.0) > 0
               THEN round((coalesce(u.day_solar_kwh, 0.0) / u.day_consumption_kwh * 100)::numeric, 2)
               ELSE 0.0
           END AS solar_contribution_pct,
           coalesce(u.day_readings_count, 0) AS day_readings_count
    FROM zone_registry r
    LEFT JOIN zone_usage u ON r.zone_id = u.zone_id
    ORDER BY r.zone_id
    """
    return fetch_dicts(conn, sql, {"target_day": target_day})


def recent_readings(conn, limit: int = 20) -> list[dict]:
    """Recent valid readings with meter and zone info."""
    return fetch_dicts(
        conn,
        """SELECT event_id, meter_id, household_id, zone_id, event_time, generated_at,
                  consumption_kwh, solar_kwh,
                  consumption_kwh - solar_kwh AS estimated_net_kwh,
                  kafka_partition, kafka_offset, ingested_at,
                  'valid' AS status
           FROM meter_readings
           ORDER BY ingested_at DESC, event_time DESC
           LIMIT %s""",
        (limit,),
    )


def paginated_meter_readings(
    conn,
    page: int = 1,
    page_size: int = 20,
    zone_id: str | None = None,
    household_id: str | None = None,
    meter_id: str | None = None,
    status: str = "all",
    start_time: str | None = None,
    end_time: str | None = None,
) -> dict:
    offset = max(0, (page - 1) * page_size)
    where_clauses = ["1=1"]
    params: dict = {"limit": page_size, "offset": offset}

    if status in ("valid", "all"):
        if zone_id:
            where_clauses.append("zone_id = %(zone_id)s")
            params["zone_id"] = zone_id
        if household_id:
            where_clauses.append("household_id = %(household_id)s")
            params["household_id"] = household_id
        if meter_id:
            where_clauses.append("meter_id = %(meter_id)s")
            params["meter_id"] = meter_id
        if start_time:
            where_clauses.append("event_time >= %(start_time)s")
            params["start_time"] = start_time
        if end_time:
            where_clauses.append("event_time <= %(end_time)s")
            params["end_time"] = end_time

        where_sql = " AND ".join(where_clauses)
        count_sql = f"SELECT count(*) AS total FROM meter_readings WHERE {where_sql}"
        data_sql = f"""
            SELECT event_id, meter_id, household_id, zone_id, event_time, generated_at,
                   interval_minutes, consumption_kwh, solar_kwh,
                   consumption_kwh - solar_kwh AS estimated_net_kwh,
                   kafka_partition, kafka_offset, ingested_at, 'valid' AS status,
                   NULL AS error_reason
            FROM meter_readings
            WHERE {where_sql}
            ORDER BY event_time DESC, ingested_at DESC
            LIMIT %(limit)s OFFSET %(offset)s
        """
        total = fetch_dicts(conn, count_sql, params)[0]["total"]
        rows = fetch_dicts(conn, data_sql, params)
    else:
        # Invalid readings only
        where_inv = ["1=1"]
        inv_params: dict = {"limit": page_size, "offset": offset}
        if start_time:
            where_inv.append("ingested_at >= %(start_time)s")
            inv_params["start_time"] = start_time
        if end_time:
            where_inv.append("ingested_at <= %(end_time)s")
            inv_params["end_time"] = end_time
        where_inv_sql = " AND ".join(where_inv)
        total = fetch_dicts(conn, f"SELECT count(*) AS total FROM invalid_readings WHERE {where_inv_sql}", inv_params)[0]["total"]
        data_sql = f"""
            SELECT ('DLQ-' || kafka_topic || '-' || kafka_partition || '-' || kafka_offset) AS event_id,
                   'N/A' AS meter_id, 'N/A' AS household_id, 'N/A' AS zone_id,
                   kafka_timestamp AS event_time, kafka_timestamp AS generated_at,
                   0.0 AS interval_minutes, 0.0 AS consumption_kwh, 0.0 AS solar_kwh,
                   0.0 AS estimated_net_kwh,
                   kafka_partition, kafka_offset, ingested_at, 'invalid' AS status,
                   error_reason
            FROM invalid_readings
            WHERE {where_inv_sql}
            ORDER BY ingested_at DESC
            LIMIT %(limit)s OFFSET %(offset)s
        """
        rows = fetch_dicts(conn, data_sql, inv_params)

    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def energy_timeseries(
    conn,
    start_date: date | None = None,
    end_date: date | None = None,
    zone_id: str | None = None,
    household_id: str | None = None,
) -> list[dict]:
    params: dict = {}
    where = ["1=1"]
    if start_date:
        where.append("window_start >= %(start_date)s::date")
        params["start_date"] = start_date
    if end_date:
        where.append("window_start < %(end_date)s::date + 1")
        params["end_date"] = end_date
    if zone_id:
        where.append("zone_id = %(zone_id)s")
        params["zone_id"] = zone_id
    if household_id:
        where.append("household_id = %(household_id)s")
        params["household_id"] = household_id

    where_sql = " AND ".join(where)

    sql = f"""
        SELECT window_start,
               window_end,
               coalesce(sum(consumption_kwh), 0.0) AS consumption_kwh,
               coalesce(sum(solar_kwh), 0.0) AS solar_kwh,
               coalesce(sum(consumption_kwh), 0.0) - coalesce(sum(solar_kwh), 0.0) AS estimated_net_kwh,
               coalesce(sum(readings_count), 0) AS readings_count,
               count(DISTINCT household_id) AS households_reporting
        FROM household_window_usage
        WHERE {where_sql}
        GROUP BY window_start, window_end
        ORDER BY window_start ASC
    """
    return fetch_dicts(conn, sql, params)


def household_rankings(conn, day: date) -> dict:
    top_consumers = fetch_dicts(
        conn,
        """SELECT h.household_id, h.meter_id, h.zone_id,
                  coalesce(d.consumption_kwh, 0.0) AS consumption_kwh,
                  coalesce(d.solar_kwh, 0.0) AS solar_kwh,
                  coalesce(d.estimated_net_kwh, 0.0) AS estimated_net_kwh
           FROM households h
           LEFT JOIN household_daily_totals d ON h.household_id = d.household_id AND d.sim_day = %s
           ORDER BY consumption_kwh DESC
           LIMIT 5""",
        (day,),
    )
    top_producers = fetch_dicts(
        conn,
        """SELECT h.household_id, h.meter_id, h.zone_id,
                  coalesce(d.consumption_kwh, 0.0) AS consumption_kwh,
                  coalesce(d.solar_kwh, 0.0) AS solar_kwh,
                  coalesce(d.estimated_net_kwh, 0.0) AS estimated_net_kwh,
                  CASE
                      WHEN coalesce(d.consumption_kwh, 0.0) > 0
                      THEN round((d.solar_kwh / d.consumption_kwh * 100)::numeric, 2)
                      ELSE 0.0
                  END AS solar_contribution_pct
           FROM households h
           LEFT JOIN household_daily_totals d ON h.household_id = d.household_id AND d.sim_day = %s
           WHERE h.has_solar = TRUE
           ORDER BY solar_kwh DESC
           LIMIT 5""",
        (day,),
    )
    return {"top_consumers": top_consumers, "top_producers": top_producers}


def household_bills_history(conn, household_id: str) -> list[dict]:
    return fetch_dicts(
        conn,
        """SELECT bill_date, household_id, zone_id, consumption_kwh, solar_kwh,
                  rate_lkr_per_kwh, bill_lkr, readings_count, billing_tier, subsidy_flag,
                  tariff_file, computed_at
           FROM household_bills
           WHERE household_id = %s
           ORDER BY bill_date DESC""",
        (household_id,),
    )


def bill_detail_by_id(conn, bill_id: str) -> dict | None:
    # bill_id format: INV-{household_id}-{YYYY-MM-DD} or {household_id}_{YYYY-MM-DD} or just {household_id}
    parts = bill_id.replace("INV-", "").split("_")
    if len(parts) == 2:
        hid, day_str = parts[0], parts[1]
    else:
        hyphen_parts = bill_id.replace("INV-", "").split("-")
        if len(hyphen_parts) >= 4:
            hid = hyphen_parts[0]
            day_str = f"{hyphen_parts[1]}-{hyphen_parts[2]}-{hyphen_parts[3]}"
        else:
            hid = bill_id
            day_str = None

    if day_str:
        rows = fetch_dicts(
            conn,
            """SELECT b.*, h.meter_id, h.has_solar, h.solar_capacity_kw
               FROM household_bills b
               JOIN households h ON b.household_id = h.household_id
               WHERE b.household_id = %s AND b.bill_date = %s::date""",
            (hid, day_str),
        )
        if rows:
            return rows[0]

    # Fallback to latest bill for hid
    rows = fetch_dicts(
        conn,
        """SELECT b.*, h.meter_id, h.has_solar, h.solar_capacity_kw
           FROM household_bills b
           JOIN households h ON b.household_id = h.household_id
           WHERE b.household_id = %s
           ORDER BY b.bill_date DESC LIMIT 1""",
        (hid,),
    )
    return rows[0] if rows else None


