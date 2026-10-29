"""Smart-Grid Energy Monitoring & Billing - Interactive Command Center.

A rich, real-time Lambda Architecture operations dashboard featuring:
- Live Grid Operations & Zone Energy Balance (Speed Layer)
- Granular Household Analytics & 24-Hour Load Curves
- What-If Tariff Simulator & Billing Explorer (Batch Layer)
- Stream Processing Observability & Dead-Letter Queue Inspector
- Lambda Architecture Reference & Data Flow Guide
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dashboard import demo_data  # noqa: E402
from smartgrid import db, queries  # noqa: E402
from smartgrid.alerts import evaluate_alerts, overall_status  # noqa: E402
from smartgrid.config import Settings  # noqa: E402

# Page setup
st.set_page_config(
    page_title="Smart-Grid Energy Command Center",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

SETTINGS = Settings.from_env()

# Professional color palette
ZONE_COLORS = ["#2563eb", "#ea580c", "#059669", "#d97706", "#db2777", "#4f46e5"]
ZONE_COLOR_MAP = {"Z1": "#2563eb", "Z2": "#ea580c", "Z3": "#059669"}

# Inject custom CSS for a futuristic command center look
st.markdown(
    """
    <style>
    /* Metric Card styling - Clean Light Theme */
    div[data-testid="stMetric"] {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
    }
    div[data-testid="stMetric"]:hover {
        border-color: #3b82f6;
        box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.12);
        transform: translateY(-1px);
        transition: all 0.2s ease;
    }
    /* Pulse badge */
    .pulse-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: #10b981;
        margin-right: 6px;
        animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .pulse-dot-warn {
        background-color: #f59e0b;
        animation: pulse-warn 1.8s infinite;
    }
    @keyframes pulse-warn {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    }
    .pulse-dot-crit {
        background-color: #ef4444;
        animation: pulse-crit 1.8s infinite;
    }
    @keyframes pulse-crit {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }
    .status-card {
        padding: 14px 18px;
        border-radius: 10px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .chip {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .chip-blue { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .chip-green { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .chip-orange { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
    .tariff-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        margin-top: 10px;
    }
        padding: 16px;
        margin-top: 10px;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def zone_scale() -> alt.Scale:
    zones = SETTINGS.zone_ids
    return alt.Scale(domain=zones, range=ZONE_COLORS[: len(zones)])


def sim_day_number(day: date) -> int:
    return (day - SETTINGS.sim_start.date()).days + 1


def fmt_age(seconds: float | None) -> str:
    if seconds is None:
        return "–"
    return f"{seconds:.0f}s" if seconds < 120 else f"{seconds / 60:.1f} min"


# ==============================================================================
# DATA ACCESS LAYER (Live PostgreSQL with Graceful Fallback)
# ==============================================================================

class DataContext:
    def __init__(self, mode: str):
        self.mode = mode
        self.is_demo = False
        self.conn = None
        self.now = datetime.now(timezone.utc)

        if mode == "Force Demo":
            self.is_demo = True
        else:
            try:
                self.conn = db.connect(SETTINGS, retries=1)
                # Verify readings exist
                snap = queries.pipeline_snapshot(self.conn)
                if snap.get("readings_total", 0) == 0 and mode == "Auto Detect":
                    self.is_demo = True
                    self.conn.close()
                    self.conn = None
            except Exception:
                if mode == "Auto Detect":
                    self.is_demo = True
                    self.conn = None
                else:
                    raise

    def close(self):
        if self.conn:
            try:
                self.conn.close()
            except Exception:
                pass

    def get_snapshot(self) -> dict:
        if self.is_demo:
            return demo_data.get_demo_pipeline_snapshot(SETTINGS, self.now)
        return queries.pipeline_snapshot(self.conn)

    def get_alerts(self, snap: dict) -> list:
        if self.is_demo:
            return demo_data.get_demo_alerts()
        zone_daylight = queries.latest_daylight_zone_windows(self.conn)
        return evaluate_alerts(snap, zone_daylight, SETTINGS, self.now)

    def get_zone_windows(self, sim_date: date) -> pd.DataFrame:
        if self.is_demo:
            rows = demo_data.get_demo_zone_windows(SETTINGS, sim_date)
        else:
            rows = queries.zone_windows(self.conn, sim_date)
        df = pd.DataFrame(rows)
        if not df.empty:
            for c in ("consumption_kwh", "solar_kwh", "estimated_net_kwh"):
                if c in df.columns:
                    df[c] = df[c].astype(float)
        return df

    def get_zone_day_totals(self, sim_date: date) -> list[dict]:
        if self.is_demo:
            return demo_data.get_demo_zone_day_totals(SETTINGS, sim_date)
        return queries.zone_day_totals(self.conn, sim_date)

    def get_household_daily(self, sim_date: date) -> pd.DataFrame:
        if self.is_demo:
            rows = demo_data.get_demo_household_daily(SETTINGS, sim_date)
        else:
            rows = queries.household_daily(self.conn, sim_date)
        df = pd.DataFrame(rows)
        if not df.empty:
            for c in ("consumption_kwh", "solar_kwh", "estimated_net_kwh"):
                if c in df.columns:
                    df[c] = df[c].astype(float)
        return df

    def get_households(self) -> list[dict]:
        if self.is_demo:
            return demo_data.get_demo_households(SETTINGS)
        try:
            return queries.household_registry(self.conn)
        except Exception:
            return demo_data.get_demo_households(SETTINGS)

    def get_household_windows(self, household_id: str, sim_date: date) -> pd.DataFrame:
        if self.is_demo:
            rows = demo_data.get_demo_household_windows(SETTINGS, household_id, sim_date)
        else:
            try:
                rows = queries.household_windows(self.conn, household_id, sim_date)
            except Exception:
                rows = demo_data.get_demo_household_windows(SETTINGS, household_id, sim_date)
        df = pd.DataFrame(rows)
        if not df.empty:
            for c in ("consumption_kwh", "solar_kwh", "estimated_net_kwh"):
                if c in df.columns:
                    df[c] = df[c].astype(float)
        return df

    def get_bill_dates(self) -> list[date]:
        if self.is_demo:
            return [SETTINGS.sim_start.date()]
        dates = queries.bill_dates(self.conn)
        return dates if dates else [SETTINGS.sim_start.date()]

    def get_bills(self, sim_date: date) -> pd.DataFrame:
        if self.is_demo:
            rows = demo_data.get_demo_bills(SETTINGS, sim_date)
        else:
            rows = queries.bills(self.conn, sim_date)
            if not rows and sim_date == SETTINGS.sim_start.date():
                rows = demo_data.get_demo_bills(SETTINGS, sim_date)
        df = pd.DataFrame(rows)
        if not df.empty:
            for c in ("consumption_kwh", "solar_kwh", "estimated_net_kwh", "rate_lkr_per_kwh", "bill_lkr", "solar_share_pct"):
                if c in df.columns:
                    df[c] = df[c].astype(float)
        return df

    def get_billing_runs(self) -> pd.DataFrame:
        if self.is_demo:
            snap = self.get_snapshot()
            run = snap.get("last_billing_run")
            return pd.DataFrame([run]) if run else pd.DataFrame()
        return pd.DataFrame(queries.recent_billing_runs(self.conn))

    def get_stream_batches(self) -> pd.DataFrame:
        if self.is_demo:
            return pd.DataFrame(demo_data.get_demo_stream_batches())
        try:
            return pd.DataFrame(queries.stream_batches_recent(self.conn))
        except Exception:
            return pd.DataFrame(demo_data.get_demo_stream_batches())

    def get_invalid_readings(self) -> pd.DataFrame:
        if self.is_demo:
            return pd.DataFrame(demo_data.get_demo_invalid_readings())
        try:
            return pd.DataFrame(queries.invalid_readings_recent(self.conn))
        except Exception:
            return pd.DataFrame(demo_data.get_demo_invalid_readings())


# ==============================================================================
# SIDEBAR CONTROLS
# ==============================================================================

def render_sidebar():
    with st.sidebar:
        st.markdown("### ⚡ Grid Controls")
        
        # Data source selector
        data_mode = st.radio(
            "Data Source Mode",
            ["Auto Detect", "Force Live DB", "Force Demo"],
            index=0,
            help="Auto Detect uses PostgreSQL when ready, or Demo mode for interactive exploration.",
        )
        
        st.divider()
        st.markdown("#### 🔄 Refresh Settings")
        auto_refresh = st.toggle("Live Auto-Refresh", value=True)
        refresh_sec = st.select_slider(
            "Interval (seconds)",
            options=[2, 3, 5, 10, 15, 30],
            value=int(SETTINGS.dashboard_refresh_seconds or 5),
            disabled=not auto_refresh,
        )
        
        st.divider()
        st.markdown("#### 🔍 Filter Criteria")
        selected_zones = st.multiselect(
            "Grid Zones",
            options=SETTINGS.zone_ids,
            default=SETTINGS.zone_ids,
            help="Filter analytics and charts by selected zones.",
        )
        if not selected_zones:
            selected_zones = SETTINGS.zone_ids

        st.caption(
            f"**Simulated Speed:** 288× ({SETTINGS.sim_day_seconds:.0f}s / day)\n\n"
            f"**Tick:** Every {SETTINGS.reading_interval_seconds:.0f}s ({SETTINGS.interval_minutes:.0f} min sim time)"
        )

        return {
            "mode": data_mode,
            "auto_refresh": auto_refresh,
            "refresh_sec": refresh_sec,
            "zones": selected_zones,
        }


# ==============================================================================
# TAB 1: LIVE GRID OPERATIONS (SPEED LAYER)
# ==============================================================================

def render_tab_operations(ctx: DataContext, current_day: date, zones_filter: list[str]):
    st.markdown("### ⚡ Live Zone Energy & Grid Balance (Speed Layer)")
    
    totals = ctx.get_zone_day_totals(current_day)
    filtered_totals = [t for t in totals if t["zone_id"] in zones_filter]

    if filtered_totals:
        tot_c = sum(t["consumption_kwh"] for t in filtered_totals)
        tot_s = sum(t["solar_kwh"] for t in filtered_totals)
        tot_net = sum(t["estimated_net_kwh"] for t in filtered_totals)
        tot_share = (tot_s / tot_c) if tot_c > 0 else 0.0

        m1, m2, m3, m4, m5 = st.columns(5)
        m1.metric("Grid Total Demand", f"{tot_c:.2f} kWh", help="Accumulated consumption today across selected zones")
        m2.metric("Solar Generated", f"{tot_s:.2f} kWh", help="Total rooftop solar energy generated today")
        m3.metric("Net Grid Load", f"{tot_net:.2f} kWh", delta=f"{'Deficit' if tot_net > 0 else 'Surplus'}",
                  delta_color="inverse", help="Net Energy = Total Consumption - Total Solar")
        m4.metric("Renewable Share", f"{tot_share:.1%}",
                  delta=f"{(tot_share - SETTINGS.low_renewable_threshold):.1%} vs threshold",
                  help=f"Target threshold is {SETTINGS.low_renewable_threshold:.0%}")
        m5.metric("Active Zones", f"{len(filtered_totals)} / {SETTINGS.num_zones}", help="Reporting zones")

        st.write("")
        # Zone KPI cards
        z_cols = st.columns(len(filtered_totals))
        for col, z in zip(z_cols, filtered_totals):
            with col:
                zid = z["zone_id"]
                color_hex = ZONE_COLOR_MAP.get(zid, "#2563eb")
                st.markdown(
                    f"""
                    <div style="border-left: 4px solid {color_hex}; padding-left: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <span class="chip" style="background: {color_hex}15; color: {color_hex}; border: 1px solid {color_hex}33;">Zone {zid}</span>
                        <div style="font-size: 1.3rem; font-weight: 700; color: #0f172a; margin-top: 6px;">{z['estimated_net_kwh']:.2f} <span style="font-size: 0.85rem; font-weight: 500; color: #64748b;">net kWh</span></div>
                        <div style="font-size: 0.85rem; color: #475569; margin-top: 6px;">
                            Consumed: <b>{z['consumption_kwh']:.2f} kWh</b><br/>
                            Solar: <b>{z['solar_kwh']:.2f} kWh</b> ({z.get('solar_share', 0):.0%})
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

    st.write("")
    st.write("")
    
    # Interactive Window Visualizer
    windows_df = ctx.get_zone_windows(current_day)
    if windows_df.empty:
        st.info("Waiting for the first Spark 2-hour window aggregates to land in PostgreSQL…")
        return

    # Filter dataframe by selected zones
    plot_df = windows_df[windows_df["zone_id"].isin(zones_filter)].copy()
    if plot_df.empty:
        st.warning("No data for the selected zone filter.")
        return

    # Chart Controls
    c_left, c_right = st.columns([2, 1])
    with c_left:
        metric_choice = st.segmented_control(
            "Primary Chart Metric",
            ["All Combined", "Consumption", "Solar Generation", "Net Energy"],
            default="All Combined",
        )
    with c_right:
        chart_type = st.segmented_control(
            "Display Style",
            ["Line Trend", "Stacked Area", "Grouped Bar"],
            default="Line Trend",
        )

    # Base chart encoding
    scale = zone_scale()
    time_axis = alt.Axis(format="%H:%M", grid=True, title="Simulated Time (UTC 2-Hour Windows)")

    if metric_choice == "Consumption":
        val_field, val_title = "consumption_kwh", "Energy Consumed (kWh)"
    elif metric_choice == "Solar Generation":
        val_field, val_title = "solar_kwh", "Solar Generated (kWh)"
    elif metric_choice == "Net Energy":
        val_field, val_title = "estimated_net_kwh", "Net Energy (kWh)"
    else:
        val_field, val_title = None, None

    if val_field:
        if chart_type == "Stacked Area":
            chart = (
                alt.Chart(plot_df, title=f"Zone {val_title} by Window")
                .mark_area(opacity=0.6)
                .encode(
                    x=alt.X("window_start:T", title="Simulated Time", axis=time_axis),
                    y=alt.Y(f"{val_field}:Q", title=val_title, stack=True),
                    color=alt.Color("zone_id:N", scale=scale, title="Zone"),
                    tooltip=["zone_id:N", "window_start:T", f"{val_field}:Q", "readings_count:Q"],
                )
                .properties(height=340)
                .interactive()
            )
        elif chart_type == "Grouped Bar":
            chart = (
                alt.Chart(plot_df, title=f"Zone {val_title} Comparison")
                .mark_bar()
                .encode(
                    x=alt.X("window_start:T", title="Simulated Time", axis=time_axis),
                    xOffset="zone_id:N",
                    y=alt.Y(f"{val_field}:Q", title=val_title),
                    color=alt.Color("zone_id:N", scale=scale, title="Zone"),
                    tooltip=["zone_id:N", "window_start:T", f"{val_field}:Q", "readings_count:Q"],
                )
                .properties(height=340)
            )
        else:
            chart = (
                alt.Chart(plot_df, title=f"Zone {val_title} Timeline")
                .mark_line(point=alt.OverlayMarkDef(size=60, filled=True), strokeWidth=2.5)
                .encode(
                    x=alt.X("window_start:T", title="Simulated Time", axis=time_axis),
                    y=alt.Y(f"{val_field}:Q", title=val_title),
                    color=alt.Color("zone_id:N", scale=scale, title="Zone"),
                    tooltip=["zone_id:N", "window_start:T", f"{val_field}:Q", "readings_count:Q"],
                )
                .properties(height=340)
                .interactive()
            )
        st.altair_chart(chart, use_container_width=True)
    else:
        # Combined multi-panel layout
        p1, p2 = st.columns(2)
        with p1:
            c1 = (
                alt.Chart(plot_df, title="Demand Profile: Consumption (kWh)")
                .mark_line(point=alt.OverlayMarkDef(size=50, filled=True), strokeWidth=2)
                .encode(
                    x=alt.X("window_start:T", title="UTC Time", axis=time_axis),
                    y=alt.Y("consumption_kwh:Q", title="Consumption (kWh)"),
                    color=alt.Color("zone_id:N", scale=scale, title="Zone"),
                    tooltip=["zone_id:N", "window_start:T", "consumption_kwh:Q"],
                )
                .properties(height=260)
                .interactive()
            )
            st.altair_chart(c1, use_container_width=True)
        with p2:
            c2 = (
                alt.Chart(plot_df, title="Renewable Profile: Solar Output (kWh)")
                .mark_line(point=alt.OverlayMarkDef(size=50, filled=True), strokeWidth=2)
                .encode(
                    x=alt.X("window_start:T", title="UTC Time", axis=time_axis),
                    y=alt.Y("solar_kwh:Q", title="Solar (kWh)"),
                    color=alt.Color("zone_id:N", scale=scale, title="Zone"),
                    tooltip=["zone_id:N", "window_start:T", "solar_kwh:Q"],
                )
                .properties(height=260)
                .interactive()
            )
            st.altair_chart(c2, use_container_width=True)

        c3 = (
            alt.Chart(plot_df, title="Net Grid Load (Consumption − Solar)")
            .mark_area(opacity=0.45)
            .encode(
                x=alt.X("window_start:T", title="UTC Time", axis=time_axis),
                y=alt.Y("estimated_net_kwh:Q", title="Net Energy (kWh)"),
                color=alt.Color("zone_id:N", scale=scale, title="Zone"),
                tooltip=["zone_id:N", "window_start:T", "estimated_net_kwh:Q"],
            )
            .properties(height=240)
            .interactive()
        )
        st.altair_chart(c3, use_container_width=True)

    # Granular data table with download
    with st.expander("📋 View Raw Zone Window Data & Export"):
        st.dataframe(plot_df, hide_index=True, use_container_width=True)
        csv_data = plot_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Download Window Records (CSV)",
            data=csv_data,
            file_name=f"zone_windows_{current_day}.csv",
            mime="text/csv",
        )


# ==============================================================================
# TAB 2: HOUSEHOLD ANALYTICS & DEEP DIVE
# ==============================================================================

def render_tab_households(ctx: DataContext, current_day: date, zones_filter: list[str]):
    st.markdown("### 🏠 Household Analytics & 24-Hour Load Curves")

    daily_df = ctx.get_household_daily(current_day)
    if daily_df.empty:
        st.info("No household readings recorded for today yet.")
        return

    # Filter by selected zones
    daily_df = daily_df[daily_df["zone_id"].isin(zones_filter)].copy()
    households_meta = ctx.get_households()
    hh_dict = {h["household_id"]: h for h in households_meta}

    # Add solar metadata to daily_df if not present
    if "has_solar" not in daily_df.columns:
        daily_df["has_solar"] = daily_df["household_id"].map(lambda hid: hh_dict.get(hid, {}).get("has_solar", False))
        daily_df["solar_capacity_kw"] = daily_df["household_id"].map(lambda hid: hh_dict.get(hid, {}).get("solar_capacity_kw", 0.0))

    # Top stats
    top_c1, top_c2, top_c3, top_c4 = st.columns(4)
    top_c1.metric("Tracked Households", len(daily_df))
    solar_count = int(daily_df["has_solar"].sum())
    top_c2.metric("Solar Prosumers", f"{solar_count} / {len(daily_df)}", f"{solar_count / len(daily_df):.0%} adoption")
    avg_c = daily_df["consumption_kwh"].mean()
    top_c3.metric("Avg Household Demand", f"{avg_c:.2f} kWh")
    avg_s = daily_df[daily_df["has_solar"]]["solar_kwh"].mean() if solar_count > 0 else 0.0
    top_c4.metric("Avg Solar Output", f"{avg_s:.2f} kWh", help="Average generation among prosumer households")

    st.write("")
    
    # Household Deep-Dive Section
    st.markdown("#### 🔍 Individual Household Profiler & 24h Profile")
    all_hids = sorted(daily_df["household_id"].unique())
    sel_hid = st.selectbox("Select Household to Inspect", all_hids, index=0)

    h_meta = hh_dict.get(sel_hid, {})
    h_row = daily_df[daily_df["household_id"] == sel_hid].iloc[0]

    # Household profile badge banner
    badge_bg = "#ecfdf5" if h_row["has_solar"] else "#f8fafc"
    badge_border = "#a7f3d0" if h_row["has_solar"] else "#e2e8f0"
    badge_text = "☀️ Solar Prosumer" if h_row["has_solar"] else "🔌 Grid-Only Consumer"
    badge_color = "#047857" if h_row["has_solar"] else "#64748b"
    
    p1, p2, p3, p4 = st.columns([1.2, 1, 1, 1])
    with p1:
        st.markdown(
            f"""
            <div style="background: {badge_bg}; border: 1px solid {badge_border}; border-radius: 8px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <div style="font-size: 1.15rem; font-weight: 700; color: #0f172a;">Household {sel_hid}</div>
                <div style="font-size: 0.85rem; color: #64748b;">Zone {h_row['zone_id']} · Meter {h_meta.get('meter_id', 'M-' + sel_hid)}</div>
                <div style="margin-top: 6px; font-weight: 600; font-size: 0.85rem; color: {badge_color};">{badge_text}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with p2:
        st.metric("Total Consumed", f"{h_row['consumption_kwh']:.2f} kWh")
    with p3:
        st.metric("Total Solar Generated", f"{h_row['solar_kwh']:.2f} kWh",
                  help=f"Installed capacity: {h_meta.get('solar_capacity_kw', 0.0):.2f} kW")
    with p4:
        st.metric("Net Grid Dependency", f"{h_row['estimated_net_kwh']:.2f} kWh",
                  delta=f"{'Grid Importer' if h_row['estimated_net_kwh'] > 0 else 'Net Exporter'}",
                  delta_color="inverse")

    # Time series load curve for this household
    hw_df = ctx.get_household_windows(sel_hid, current_day)
    if not hw_df.empty:
        # Prepare melted frame for Altair multi-line
        melted = pd.melt(
            hw_df,
            id_vars=["window_start", "window_end"],
            value_vars=["consumption_kwh", "solar_kwh", "estimated_net_kwh"],
            var_name="Energy Type",
            value_name="kWh",
        )
        type_names = {
            "consumption_kwh": "Demand (Consumed)",
            "solar_kwh": "Solar Generation",
            "estimated_net_kwh": "Net Grid Load",
        }
        melted["Energy Type"] = melted["Energy Type"].map(type_names)

        color_scale = alt.Scale(
            domain=["Demand (Consumed)", "Solar Generation", "Net Grid Load"],
            range=["#ef4444", "#10b981", "#3b82f6"],
        )

        hh_chart = (
            alt.Chart(melted, title=f"24-Hour Load & Solar Curve for Household {sel_hid}")
            .mark_line(point=alt.OverlayMarkDef(size=55, filled=True), strokeWidth=2.5)
            .encode(
                x=alt.X("window_start:T", title="Simulated UTC Time", axis=alt.Axis(format="%H:%M", grid=True)),
                y=alt.Y("kWh:Q", title="Energy (kWh per 2h window)"),
                color=alt.Color("Energy Type:N", scale=color_scale),
                tooltip=["window_start:T", "Energy Type:N", alt.Tooltip("kWh:Q", format=".3f")],
            )
            .properties(height=280)
            .interactive()
        )
        st.altair_chart(hh_chart, use_container_width=True)

    st.write("")
    st.write("")
    
    # Household Leaderboards
    st.markdown("#### 🏆 Household Rankings & Comparison")
    l_col1, l_col2 = st.columns(2)
    with l_col1:
        top_consumers = daily_df.sort_values("consumption_kwh", ascending=False).head(5)
        bar1 = (
            alt.Chart(top_consumers, title="Top 5 Energy Consumers Today (kWh)")
            .mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4)
            .encode(
                x=alt.X("consumption_kwh:Q", title="Consumption (kWh)"),
                y=alt.Y("household_id:N", sort="-x", title="Household"),
                color=alt.Color("zone_id:N", scale=zone_scale(), title="Zone"),
                tooltip=["household_id:N", "zone_id:N", "consumption_kwh:Q"],
            )
            .properties(height=200)
        )
        st.altair_chart(bar1, use_container_width=True)

    with l_col2:
        solar_producers = daily_df[daily_df["has_solar"]].sort_values("solar_kwh", ascending=False).head(5)
        if not solar_producers.empty:
            bar2 = (
                alt.Chart(solar_producers, title="Top 5 Solar Generators Today (kWh)")
                .mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4)
                .encode(
                    x=alt.X("solar_kwh:Q", title="Solar Generated (kWh)"),
                    y=alt.Y("household_id:N", sort="-x", title="Household"),
                    color=alt.value("#10b981"),
                    tooltip=["household_id:N", "zone_id:N", "solar_kwh:Q", "solar_capacity_kw:Q"],
                )
                .properties(height=200)
            )
            st.altair_chart(bar2, use_container_width=True)
        else:
            st.info("No solar producers in the selected filter.")

    # Full table
    with st.expander("📊 Complete Household Ledger Table"):
        daily_display = daily_df.copy()
        daily_display["solar_share"] = (daily_display["solar_kwh"] / daily_display["consumption_kwh"]).fillna(0.0)
        st.dataframe(
            daily_display[["household_id", "zone_id", "consumption_kwh", "solar_kwh", "estimated_net_kwh", "solar_share", "readings_count"]],
            hide_index=True,
            use_container_width=True,
            column_config={
                "solar_share": st.column_config.ProgressColumn("Solar Share", format="%.0f%%", min_value=0, max_value=1),
                "consumption_kwh": st.column_config.NumberColumn("Consumed (kWh)", format="%.3f"),
                "solar_kwh": st.column_config.NumberColumn("Solar (kWh)", format="%.3f"),
                "estimated_net_kwh": st.column_config.NumberColumn("Net (kWh)", format="%.3f"),
            },
        )


# ==============================================================================
# TAB 3: BILLING & WHAT-IF TARIFF SIMULATOR (BATCH LAYER)
# ==============================================================================

def render_tab_billing(ctx: DataContext, zones_filter: list[str]):
    st.markdown("### 💰 Household Daily Bills & What-If Tariff Simulator")

    dates = ctx.get_bill_dates()
    if not dates:
        st.info("No bills recorded yet. The first daily tariff file lands after simulated day 1 completes.")
        return

    b_col1, b_col2 = st.columns([1, 2])
    with b_col1:
        selected_date = st.selectbox(
            "Select Bill Date",
            dates,
            format_func=lambda d: f"Day {sim_day_number(d)} - {d}",
            key="bill_date_picker",
        )

    bills_df = ctx.get_bills(selected_date)
    if bills_df.empty:
        st.warning("No bills available for this date.")
        return

    # Filter by selected zones
    bills_df = bills_df[bills_df["zone_id"].isin(zones_filter)].copy()
    if bills_df.empty:
        st.warning("No bills match the selected zone filter.")
        return

    # Key Billing Metrics
    total_rev = bills_df["bill_lkr"].sum()
    total_energy = bills_df["consumption_kwh"].sum()
    avg_rate = total_rev / total_energy if total_energy > 0 else 0.0
    subsidized_count = int(bills_df["subsidy_flag"].sum()) if "subsidy_flag" in bills_df.columns else 0

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Total Utility Revenue", f"LKR {total_rev:,.2f}")
    k2.metric("Total Billed Energy", f"{total_energy:.2f} kWh")
    k3.metric("Effective Avg Rate", f"LKR {avg_rate:.2f} / kWh")
    k4.metric("Subsidized Accounts", f"{subsidized_count} / {len(bills_df)}")

    st.write("")
    
    # Visual Breakdown: Cost by Zone & Tier Distribution
    v1, v2 = st.columns(2)
    with v1:
        zone_billing = bills_df.groupby("zone_id")["bill_lkr"].sum().reset_index()
        z_chart = (
            alt.Chart(zone_billing, title="Total Revenue by Zone (LKR)")
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4)
            .encode(
                x=alt.X("zone_id:N", title="Grid Zone"),
                y=alt.Y("bill_lkr:Q", title="Total Billed (LKR)"),
                color=alt.Color("zone_id:N", scale=zone_scale(), title="Zone"),
                tooltip=["zone_id:N", alt.Tooltip("bill_lkr:Q", format=",.2f")],
            )
            .properties(height=210)
        )
        st.altair_chart(z_chart, use_container_width=True)

    with v2:
        if "billing_tier" in bills_df.columns:
            tier_df = bills_df.groupby("billing_tier")["household_id"].count().reset_index(name="households")
            tier_chart = (
                alt.Chart(tier_df, title="Households by Tariff Tier")
                .mark_arc(innerRadius=45)
                .encode(
                    theta=alt.Theta("households:Q"),
                    color=alt.Color("billing_tier:N", title="Tier"),
                    tooltip=["billing_tier:N", "households:Q"],
                )
                .properties(height=210)
            )
            st.altair_chart(tier_chart, use_container_width=True)

    # Interactive Bill Ledger
    st.markdown("#### 📑 Daily Billing Ledger")
    cols_to_show = ["household_id", "zone_id", "consumption_kwh", "solar_kwh", "solar_share_pct", "rate_lkr_per_kwh", "bill_lkr", "billing_tier", "subsidy_flag"]
    existing_cols = [c for c in cols_to_show if c in bills_df.columns]
    
    st.dataframe(
        bills_df[existing_cols],
        hide_index=True,
        use_container_width=True,
        column_config={
            "bill_lkr": st.column_config.NumberColumn("Bill (LKR)", format="LKR %.2f"),
            "rate_lkr_per_kwh": st.column_config.NumberColumn("Rate (LKR/kWh)", format="%.2f"),
            "consumption_kwh": st.column_config.NumberColumn("Consumption (kWh)", format="%.3f"),
            "solar_kwh": st.column_config.NumberColumn("Solar (kWh)", format="%.3f"),
            "solar_share_pct": st.column_config.ProgressColumn("Solar Share", format="%.1f%%", min_value=0, max_value=100),
            "subsidy_flag": st.column_config.CheckboxColumn("Subsidized"),
        },
    )

    # CSV Download
    bills_csv = bills_df.to_csv(index=False).encode("utf-8")
    st.download_button(
        label="📥 Download Authoritative Bills CSV",
        data=bills_csv,
        file_name=f"smartgrid_bills_{selected_date}.csv",
        mime="text/csv",
    )

    st.write("")
    st.divider()

    # ==========================================================================
    # WHAT-IF TARIFF SIMULATOR
    # ==========================================================================
    st.markdown("### 🔮 Interactive What-If Tariff Policy Simulator")
    st.caption("Model policy changes: evaluate how new rate structures, net metering, or subsidies impact utility revenues and household energy costs.")

    sim_c1, sim_c2 = st.columns([1, 1])
    with sim_c1:
        base_rate_mod = st.slider("Base Energy Rate (LKR / kWh)", min_value=15.0, max_value=60.0, value=33.0, step=0.5)
        fit_credit = st.slider("Solar Feed-In Tariff / Export Credit (LKR / kWh)", min_value=0.0, max_value=35.0, value=12.0, step=0.5,
                               help="Credit credited to prosumers for each kWh of solar generation")
    with sim_c2:
        subsidy_discount = st.slider("Low-Income Subsidy Discount (%)", min_value=0, max_value=50, value=25, step=5)
        high_demand_surcharge = st.slider("Peak / High Demand Surcharge (%)", min_value=0, max_value=50, value=15, step=5)

    # Compute What-If Bills
    sim_df = bills_df.copy()
    
    def calc_whatif_bill(row):
        c_kwh = row["consumption_kwh"]
        s_kwh = row["solar_kwh"]
        subsidized = row.get("subsidy_flag", False)
        is_high = "High" in str(row.get("billing_tier", ""))

        rate = base_rate_mod
        if subsidized:
            rate *= (1.0 - subsidy_discount / 100.0)
        elif is_high:
            rate *= (1.0 + high_demand_surcharge / 100.0)

        gross_charge = c_kwh * rate
        solar_credit = s_kwh * fit_credit
        net_bill = max(0.0, gross_charge - solar_credit)
        return round(net_bill, 2)

    sim_df["whatif_bill_lkr"] = sim_df.apply(calc_whatif_bill, axis=1)
    sim_df["diff_lkr"] = sim_df["whatif_bill_lkr"] - sim_df["bill_lkr"]

    new_rev = sim_df["whatif_bill_lkr"].sum()
    rev_delta = new_rev - total_rev
    pct_delta = (rev_delta / total_rev * 100) if total_rev > 0 else 0.0

    res1, res2, res3 = st.columns(3)
    res1.metric("Simulated Revenue", f"LKR {new_rev:,.2f}", f"{pct_delta:+.1f}% vs baseline", delta_color="normal")
    avg_change = sim_df["diff_lkr"].mean()
    res2.metric("Avg Household Bill Impact", f"LKR {avg_change:+.2f}", delta=f"{'Savings for Users' if avg_change < 0 else 'Cost Increase'}", delta_color="inverse")
    solar_savings = (sim_df[sim_df["solar_kwh"] > 0]["solar_kwh"] * fit_credit).sum()
    res3.metric("Total Solar FIT Credits Distributed", f"LKR {solar_savings:,.2f}", help="Total credits earned by solar adopters")

    # Before vs After Comparison Chart
    compare_melted = pd.melt(
        sim_df,
        id_vars=["household_id"],
        value_vars=["bill_lkr", "whatif_bill_lkr"],
        var_name="Scenario",
        value_name="Bill_LKR",
    )
    compare_melted["Scenario"] = compare_melted["Scenario"].map({"bill_lkr": "Original Bill", "whatif_bill_lkr": "Simulated What-If"})

    compare_chart = (
        alt.Chart(compare_melted, title="Household Bill Impact: Original vs What-If Policy")
        .mark_bar()
        .encode(
            x=alt.X("household_id:N", title="Household"),
            xOffset="Scenario:N",
            y=alt.Y("Bill_LKR:Q", title="Bill Amount (LKR)"),
            color=alt.Color("Scenario:N", scale=alt.Scale(domain=["Original Bill", "Simulated What-If"], range=["#64748b", "#3b82f6"])),
            tooltip=["household_id:N", "Scenario:N", alt.Tooltip("Bill_LKR:Q", format=",.2f")],
        )
        .properties(height=260)
    )
    st.altair_chart(compare_chart, use_container_width=True)


# ==============================================================================
# TAB 4: STREAM PIPELINE & OBSERVABILITY
# ==============================================================================

def render_tab_observability(ctx: DataContext, snap: dict, alerts: list):
    st.markdown("### 🛠️ Pipeline Health & Stream Observability")

    # Overall Status Banner
    status = overall_status(alerts)
    badge_color = {"ok": "#10b981", "warning": "#f59e0b", "critical": "#ef4444"}[status]
    badge_label = {"ok": "HEALTHY", "warning": "WARNING", "critical": "CRITICAL"}[status]
    dot_class = {"ok": "pulse-dot", "warning": "pulse-dot pulse-dot-warn", "critical": "pulse-dot pulse-dot-crit"}[status]

    st.markdown(
        f"""
        <div class="status-card" style="background: #ffffff; border: 1px solid {badge_color}55; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center;">
                <span class="{dot_class}"></span>
                <span style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-left: 8px;">Pipeline Status: {badge_label}</span>
            </div>
            <div style="font-size: 0.85rem; color: #64748b;">
                {len(alerts)} Active Alert(s) · Checked at {ctx.now:%H:%M:%S} UTC
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Active alerts list
    if alerts:
        for a in alerts:
            icon = "🔴" if a.severity == "critical" else "🟠"
            st.warning(f"{icon} **[{a.name}]** {a.message}")
    else:
        st.success("✅ All health checks passing: fresh readings, low error rates, billing verified.")

    # Core Pipeline Health Metrics
    latest_ingested = snap.get("latest_ingested_at")
    age = (ctx.now - latest_ingested).total_seconds() if latest_ingested else None
    run = snap.get("last_billing_run")

    h1, h2, h3, h4 = st.columns(4)
    h1.metric("Ingest Freshness", fmt_age(age), help=f"Alert if stale > {SETTINGS.stale_after_seconds}s")
    h2.metric("Valid Readings Stored", f"{snap.get('readings_total', 0):,}", help="De-duplicated rows in meter_readings")
    h3.metric("Dead Letters / Duplicates", f"{snap.get('invalid_total', 0):,} / {snap.get('duplicates_total', 0):,}")
    if run:
        icon = "✅" if run.get("status") == "success" else "❌"
        h4.metric("Last Batch Billing Run", f"{icon} {run.get('status')}", help=run.get("message", ""))
    else:
        h4.metric("Last Batch Billing Run", "Pending")

    st.write("")
    st.write("")
    
    # Spark Micro-Batch Observability
    st.markdown("#### ⚡ Spark Structured Streaming Micro-Batch Performance")
    batches_df = ctx.get_stream_batches()
    if not batches_df.empty:
        b1, b2 = st.columns(2)
        with b1:
            # Throughput line chart
            m_batch = pd.melt(
                batches_df.head(20),
                id_vars=["processed_at", "batch_id"],
                value_vars=["valid_rows", "duplicate_rows", "invalid_rows"],
                var_name="Row Status",
                value_name="Count",
            )
            batch_chart = (
                alt.Chart(m_batch, title="Micro-Batch Row Processing Throughput")
                .mark_line(point=alt.OverlayMarkDef(size=40, filled=True), strokeWidth=2)
                .encode(
                    x=alt.X("processed_at:T", title="Timestamp", axis=alt.Axis(format="%H:%M:%S")),
                    y=alt.Y("Count:Q", title="Rows per Batch"),
                    color=alt.Color("Row Status:N", scale=alt.Scale(domain=["valid_rows", "duplicate_rows", "invalid_rows"], range=["#10b981", "#f59e0b", "#ef4444"])),
                    tooltip=["batch_id:Q", "processed_at:T", "Row Status:N", "Count:Q"],
                )
                .properties(height=220)
            )
            st.altair_chart(batch_chart, use_container_width=True)

        with b2:
            # Latency / Duration chart
            dur_chart = (
                alt.Chart(batches_df.head(20), title="Batch Processing Duration (Latency)")
                .mark_bar(color="#6366f1")
                .encode(
                    x=alt.X("processed_at:T", title="Timestamp", axis=alt.Axis(format="%H:%M:%S")),
                    y=alt.Y("duration_ms:Q", title="Duration (ms)"),
                    tooltip=["batch_id:Q", "duration_ms:Q"],
                )
                .properties(height=220)
            )
            st.altair_chart(dur_chart, use_container_width=True)

    # Dead-Letter Queue (Invalid Readings)
    st.markdown("#### 🛑 Dead-Letter Queue (Rejected Readings)")
    inv_df = ctx.get_invalid_readings()
    if not inv_df.empty:
        i_col1, i_col2 = st.columns([1, 2])
        with i_col1:
            err_counts = inv_df["error_reason"].value_counts().reset_index()
            err_counts.columns = ["error_reason", "count"]
            err_chart = (
                alt.Chart(err_counts, title="Rejection Reason Distribution")
                .mark_arc(innerRadius=40)
                .encode(
                    theta=alt.Theta("count:Q"),
                    color=alt.Color("error_reason:N", title="Reason"),
                    tooltip=["error_reason:N", "count:Q"],
                )
                .properties(height=200)
            )
            st.altair_chart(err_chart, use_container_width=True)

        with i_col2:
            st.dataframe(
                inv_df[["kafka_topic", "error_reason", "raw_value", "ingested_at"]].head(10),
                hide_index=True,
                use_container_width=True,
            )
    else:
        st.info("No invalid readings recorded in the dead-letter queue.")

    # Airflow Billing Runs Audit
    st.markdown("#### 🔄 Airflow Batch Job Audit Trail")
    runs_df = ctx.get_billing_runs()
    if not runs_df.empty:
        st.dataframe(runs_df, hide_index=True, use_container_width=True)


# ==============================================================================
# TAB 5: ARCHITECTURE & GUIDE
# ==============================================================================

def render_tab_architecture():
    st.markdown("### 📘 System Architecture & Lambda Design Rationale")
    
    st.markdown(
        """
        ```
        meter_simulator (12 households / 3 zones)
               │
               ▼ (JSON readings via Kafka: 3 partitions)
        Spark Structured Streaming (Speed Layer)
               │
               ├──► meter_readings (Master Dataset, ON CONFLICT DO NOTHING)
               ├──► invalid_readings (Dead-Letter Table)
               ├──► stream_batches (Observability Metrics)
               └──► household_window_usage (2-Hour Tumbling Windows)
                        │
                        ▼ (SQL Views: zone_window_totals, household_daily_totals)
               Streamlit Dashboard (:8501) & FastAPI Serving (:8000)
        
        End of Simulated Day:
               │
        tariff_simulator ──► data/incoming/tariffs_YYYY-MM-DD.csv
                                   │
                                   ▼
        Airflow DAG smartgrid_billing (Batch Layer)
               ├──► Recomputes consumption from raw meter_readings
               ├──► Computes financial bills & speed-layer reconciliation
               └──► household_bills & billing_runs audit table
        ```
        """
    )
    
    a1, a2 = st.columns(2)
    with a1:
        st.markdown(
            """
            #### ⚡ Why Lambda Architecture?
            - **Speed Layer:** Low-latency aggregation via Spark Structured Streaming gives operators instant visibility into zone load and solar generation.
            - **Batch Layer:** Authoritative financial billing requires complete 24-hour datasets and auditability. Airflow ensures idempotent batch runs from raw master readings.
            - **Reconciliation:** The system compares Speed Layer window sums against Batch Layer calculations (`speed_layer_max_diff_kwh`).
            """
        )
    with a2:
        st.markdown(
            f"""
            #### ⏱️ Simulation Clock Specifications
            - **Time Compression:** 288× speedup (1 simulated day = {SETTINGS.sim_day_seconds:.0f} real seconds).
            - **Reading Cadence:** 1 reading per household every {SETTINGS.reading_interval_seconds:.0f}s ({SETTINGS.interval_minutes:.0f} sim minutes).
            - **Timezone:** Strict UTC throughout. Simulated 12:00 UTC corresponds to solar noon.
            - **Idempotency:** `event_id = uuid5(household_id | event_time)` guarantees deduplication.
            """
        )


# ==============================================================================
# MAIN APPLICATION CONTROLLER
# ==============================================================================

def main():
    sidebar_params = render_sidebar()
    mode = sidebar_params["mode"]
    zones_filter = sidebar_params["zones"]
    auto_refresh = sidebar_params["auto_refresh"]
    refresh_sec = sidebar_params["refresh_sec"]

    # Header section
    h_col1, h_col2 = st.columns([3, 1])
    with h_col1:
        st.title("⚡ Smart-Grid Energy Command Center")
        st.caption("Live streaming analytics, prosumer solar tracking, and automated tariff billing.")
    with h_col2:
        if st.button("🔄 Force Refresh Now", use_container_width=True):
            st.rerun()

    # Fragment with dynamic auto-refresh interval
    @st.fragment(run_every=refresh_sec if auto_refresh else None)
    def live_content():
        ctx = DataContext(mode)
        try:
            snap = ctx.get_snapshot()
            alerts = ctx.get_alerts(snap)
            latest = snap.get("latest_reading")

            # Status ribbon
            r1, r2, r3 = st.columns(3)
            sim_time = latest["event_time"] if latest else ctx.now
            sim_day = sim_time.date() if isinstance(sim_time, datetime) else SETTINGS.sim_start.date()

            r1.metric("Simulated Clock", f"Day {sim_day_number(sim_day)} · {sim_time:%Y-%m-%d %H:%M} UTC")
            source_label = "Demo Preview" if ctx.is_demo else "PostgreSQL (Live)"
            r2.metric("Data Engine", source_label, help="Operating data source")
            r3.metric("Last Refreshed", f"{ctx.now:%H:%M:%S} UTC")

            st.write("")

            # Primary Tabbed Interface
            tab1, tab2, tab3, tab4, tab5 = st.tabs([
                "⚡ Live Grid Operations",
                "🏠 Household Deep Dive",
                "💰 Billing & Simulator",
                "🛠️ Observability & DQ",
                "📘 System Architecture",
            ])

            with tab1:
                render_tab_operations(ctx, sim_day, zones_filter)

            with tab2:
                render_tab_households(ctx, sim_day, zones_filter)

            with tab3:
                render_tab_billing(ctx, zones_filter)

            with tab4:
                render_tab_observability(ctx, snap, alerts)

            with tab5:
                render_tab_architecture()

        finally:
            ctx.close()

    live_content()


if __name__ == "__main__":
    main()
