export type DataBadgeType = 'Live' | 'Historical' | 'Estimate' | 'Final';

export interface DataBadgeInfo {
  type: DataBadgeType;
  tooltip: string;
}

export interface PipelineStatus {
  postgres: 'online' | 'degraded' | 'offline';
  kafka: 'online' | 'degraded' | 'offline';
  spark: 'online' | 'degraded' | 'offline';
  api: 'online' | 'degraded' | 'offline';
  latest_reading_age_seconds: number | null;
  overall: 'healthy' | 'warning' | 'critical';
}

export interface HourlyUsagePoint {
  time_label: string;
  consumption_kwh: number;
  solar_kwh: number;
  estimated_net_kwh: number;
  is_peak?: boolean;
}

export interface ZoneSummary {
  zone_id: string;
  households_count: number;
  meters_count: number;
  solar_households_count: number;
  total_solar_capacity_kw: number;
  day_consumption_kwh: number;
  day_solar_kwh: number;
  day_estimated_net_kwh: number;
  solar_contribution_pct: number;
  day_readings_count: number;
}

export interface HouseholdRankItem {
  household_id: string;
  meter_id: string;
  zone_id: string;
  consumption_kwh: number;
  solar_kwh: number;
  estimated_net_kwh: number;
  solar_contribution_pct?: number;
}

export interface ReadingItem {
  event_id: string;
  meter_id: string;
  household_id: string;
  zone_id: string;
  event_time: string;
  generated_at: string;
  interval_minutes: number;
  consumption_kwh: number;
  solar_kwh: number;
  estimated_net_kwh: number;
  kafka_partition: number;
  kafka_offset: number;
  status: 'valid' | 'invalid';
  error_reason?: string | null;
}

export interface PaginatedReadings {
  items: ReadingItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AlertItem {
  name: string;
  severity: 'critical' | 'warning';
  message: string;
}

export interface OverviewData {
  sim_day: string | null;
  kpis: {
    total_consumption_kwh: number;
    total_solar_kwh: number;
    estimated_net_kwh: number;
    total_bill_amount: number;
    active_meters_count: number;
    total_households_count: number;
    solar_contribution_pct: number;
    is_billed_final: boolean;
    latest_event_time: string | null;
    latest_ingested_at: string | null;
  };
  badges: {
    total_consumption: DataBadgeInfo;
    solar_generation: DataBadgeInfo;
    net_grid_energy: DataBadgeInfo;
    estimated_bill: DataBadgeInfo;
  };
  pipeline_status: PipelineStatus;
  hourly_usage: HourlyUsagePoint[];
  zone_comparison: ZoneSummary[];
  household_rankings: {
    top_consumers: HouseholdRankItem[];
    top_producers: HouseholdRankItem[];
  };
  recent_readings: ReadingItem[];
  latest_alerts: AlertItem[];
  last_updated: string;
}

export interface HouseholdItem {
  household_id: string;
  meter_id: string;
  zone_id: string;
  has_solar: boolean;
  solar_capacity_kw: number;
  registered_at: string;
  consumption_kwh: number;
  solar_kwh: number;
  estimated_net_kwh: number;
  solar_share_pct: number;
  bill_amount: number;
  bill_status: 'Final' | 'Estimate';
  billing_tier: string;
  readings_count: number;
}

export interface HouseholdDetailResponse {
  info: {
    household_id: string;
    meter_id: string;
    zone_id: string;
    has_solar: boolean;
    solar_capacity_kw: number;
    registered_at: string;
  };
  today_summary: {
    sim_day: string | null;
    consumption_kwh: number;
    solar_kwh: number;
    estimated_net_kwh: number;
    solar_contribution_pct: number;
    readings_count: number;
  };
  load_curve: Array<{
    window_start: string;
    window_end: string;
    time_label: string;
    consumption_kwh: number;
    solar_kwh: number;
    estimated_net_kwh: number;
    readings_count: number;
  }>;
  recent_readings: ReadingItem[];
  bills_history: BillItem[];
  latest_bill: BillItem | null;
}

export interface BillItem {
  bill_date: string;
  household_id: string;
  zone_id: string;
  consumption_kwh: number;
  solar_kwh: number;
  rate_lkr_per_kwh: number;
  bill_lkr: number;
  readings_count: number;
  billing_tier: string;
  subsidy_flag: boolean;
  tariff_file: string;
  status: 'Final' | 'Estimate';
  computed_at?: string;
  run_id?: string;
}

export interface BillsResponse {
  bill_date: string | null;
  is_final: boolean;
  total_bill_amount: number;
  total_consumption_kwh: number;
  total_solar_kwh: number;
  bills_count: number;
  bills: BillItem[];
  available_dates: string[];
}

export interface HealthResponse {
  status: 'ok' | 'warning' | 'critical';
  checked_at: string;
  uptime_seconds: number;
  latest_reading_age_seconds: number | null;
  latest_simulated_time: string | null;
  services: {
    postgres: { status: string; latency_ms: number };
    kafka: { status: string };
    spark: { status: string; latest_batch_at?: string; age_seconds?: number };
    api: { status: string; uptime_seconds: number };
  };
  metrics_summary: {
    readings_total: number;
    invalid_total: number;
    duplicates_total: number;
    households_registered: number;
  };
  last_billing_run: {
    id?: number;
    tariff_file?: string;
    bill_date?: string;
    status: string;
    households_billed?: number;
    total_bill_lkr?: number;
    message?: string;
    finished_at?: string;
  } | null;
  alerts: AlertItem[];
}

export interface TimeseriesPoint {
  window_start: string;
  window_end: string;
  time_label: string;
  consumption_kwh: number;
  solar_kwh: number;
  estimated_net_kwh: number;
  readings_count: number;
}

export interface TimeseriesResponse {
  timeseries: TimeseriesPoint[];
  summary: {
    total_consumption_kwh: number;
    total_solar_kwh: number;
    estimated_net_kwh: number;
    avg_consumption_kwh: number;
    peak_consumption_kwh: number;
    points_count: number;
  };
}
