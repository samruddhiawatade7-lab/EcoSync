"""Unit and endpoint contract tests for the Smart-Grid API."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from datetime import date, datetime, timezone
import pytest
from fastapi import HTTPException

from api.main import (
    get_overview,
    get_energy_timeseries,
    get_readings,
    get_zones,
    get_households,
    get_bills,
    health,
)


def test_health_disconnected_db_raises_http_503():
    """Verify that when database is offline, health endpoint returns 503 error, NOT fake numbers!"""
    with patch("api.main._conn", side_effect=HTTPException(status_code=503, detail="Database unavailable")):
        with pytest.raises(HTTPException) as exc:
            health()
        assert exc.value.status_code == 503


def test_overview_endpoint_contract():
    mock_snap = {
        "latest_ingested_at": datetime.now(timezone.utc),
        "latest_event_time": datetime.now(timezone.utc),
        "readings_total": 100,
        "invalid_total": 2,
        "duplicates_total": 3,
        "households": 12,
        "recent_valid": 20,
        "recent_invalid": 0,
        "latest_batch_at": datetime.now(timezone.utc),
        "last_billing_run": None,
    }
    mock_zones_summary = [
        {
            "zone_id": "Z1",
            "households_count": 4,
            "meters_count": 4,
            "solar_households_count": 2,
            "total_solar_capacity_kw": 7.5,
            "day_consumption_kwh": 45.2,
            "day_solar_kwh": 12.1,
            "day_estimated_net_kwh": 33.1,
            "solar_contribution_pct": 26.77,
            "day_readings_count": 240,
        }
    ]
    mock_household_totals = [
        {"household_id": "H001", "zone_id": "Z1", "consumption_kwh": 10.5, "solar_kwh": 3.2, "estimated_net_kwh": 7.3, "readings_count": 24}
    ]

    with patch("api.main._conn") as mock_conn_fn, \
         patch("smartgrid.queries.pipeline_snapshot", return_value=mock_snap), \
         patch("smartgrid.queries.latest_simulated_day", return_value=date(2026, 1, 1)), \
         patch("smartgrid.queries.household_daily", return_value=mock_household_totals), \
         patch("smartgrid.queries.bills", return_value=[]), \
         patch("smartgrid.queries.household_registry", return_value=[{"household_id": "H001", "meter_id": "M001", "zone_id": "Z1", "has_solar": True, "solar_capacity_kw": 3.5, "registered_at": datetime.now(timezone.utc)}]), \
         patch("smartgrid.queries.zone_windows", return_value=[]), \
         patch("smartgrid.queries.dynamic_zones_summary", return_value=mock_zones_summary), \
         patch("smartgrid.queries.household_rankings", return_value={"top_consumers": [], "top_producers": []}), \
         patch("smartgrid.queries.recent_readings", return_value=[]), \
         patch("smartgrid.queries.latest_daylight_zone_windows", return_value=[]):

        mock_conn = MagicMock()
        mock_conn_fn.return_value = mock_conn

        data = get_overview()
        assert "kpis" in data
        assert "total_consumption_kwh" in data["kpis"]
        assert "total_solar_kwh" in data["kpis"]
        assert "estimated_net_kwh" in data["kpis"]
        assert "pipeline_status" in data
        assert data["kpis"]["total_consumption_kwh"] == 10.5
        assert data["kpis"]["total_solar_kwh"] == 3.2
        assert data["kpis"]["estimated_net_kwh"] == 7.3
        # Check net energy badge tooltip states assumption
        assert "Estimate (derived)" in data["badges"]["net_grid_energy"]["tooltip"]


def test_paginated_readings_contract():
    mock_res = {
        "items": [
            {
                "event_id": "evt-001",
                "meter_id": "M001",
                "household_id": "H001",
                "zone_id": "Z1",
                "event_time": datetime.now(timezone.utc).isoformat(),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "interval_minutes": 24.0,
                "consumption_kwh": 1.25,
                "solar_kwh": 0.45,
                "estimated_net_kwh": 0.8,
                "kafka_partition": 0,
                "kafka_offset": 123,
                "status": "valid",
                "error_reason": None,
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
        "total_pages": 1,
    }

    with patch("api.main._conn") as mock_conn_fn, \
         patch("smartgrid.queries.paginated_meter_readings", return_value=mock_res):
        mock_conn = MagicMock()
        mock_conn_fn.return_value = mock_conn

        data = get_readings(page=1, page_size=20, status="valid")
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["consumption_kwh"] == 1.25


def test_bills_endpoint_contract():
    mock_bills = [
        {
            "bill_date": "2026-01-01",
            "household_id": "H001",
            "zone_id": "Z1",
            "consumption_kwh": 20.0,
            "solar_kwh": 5.0,
            "rate_lkr_per_kwh": 35.0,
            "bill_lkr": 700.0,
            "readings_count": 60,
            "billing_tier": "Standard",
            "subsidy_flag": False,
            "tariff_file": "tariffs_2026-01-01.csv",
            "status": "Final",
        }
    ]

    with patch("api.main._conn") as mock_conn_fn, \
         patch("api.main.queries.bill_dates", return_value=[date(2026, 1, 1)]), \
         patch("api.main.queries.bills", return_value=mock_bills):
        mock_conn = MagicMock()
        mock_conn_fn.return_value = mock_conn

        data = get_bills(day=date(2026, 1, 1))
        assert data["is_final"] is True
        assert data["total_bill_amount"] == 700.0
        assert len(data["bills"]) == 1
        assert data["bills"][0]["bill_lkr"] == 700.0


def test_zones_endpoint_contract():
    mock_zones = [
        {
            "zone_id": "Z1",
            "households_count": 4,
            "meters_count": 4,
            "solar_households_count": 2,
            "total_solar_capacity_kw": 7.5,
            "day_consumption_kwh": 50.0,
            "day_solar_kwh": 10.0,
            "day_estimated_net_kwh": 40.0,
            "solar_contribution_pct": 20.0,
            "day_readings_count": 100,
        }
    ]
    with patch("api.main._conn") as mock_conn_fn, \
         patch("smartgrid.queries.latest_simulated_day", return_value=date(2026, 1, 1)), \
         patch("smartgrid.queries.dynamic_zones_summary", return_value=mock_zones):
        mock_conn = MagicMock()
        mock_conn_fn.return_value = mock_conn

        res = get_zones()
        assert res["zones_count"] == 1
        assert res["zones"][0]["zone_id"] == "Z1"
        assert res["zones"][0]["solar_contribution_pct"] == 20.0
