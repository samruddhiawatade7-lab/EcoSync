import {
  BillsResponse,
  HealthResponse,
  HouseholdDetailResponse,
  HouseholdItem,
  OverviewData,
  PaginatedReadings,
  TimeseriesResponse,
  ZoneSummary,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (window.location.port === '5173' || window.location.port === '3000' ? 'http://localhost:8000' : '');

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  const response = await fetch(fullUrl, {
    headers: {
      Accept: 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok && response.status !== 503) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API Error ${response.status} (${response.statusText}): ${errorBody || 'Failed request'}`);
  }

  // Handle 503 from /health gracefully since /health returns full JSON payload even when status is critical
  return response.json();
}

export const api = {
  // 1. Overview
  async getOverview(): Promise<OverviewData> {
    return fetchJson<OverviewData>('/api/overview');
  },

  // 2. Energy Timeseries
  async getEnergyTimeseries(params?: {
    start_date?: string;
    end_date?: string;
    zone_id?: string;
    household_id?: string;
  }): Promise<TimeseriesResponse> {
    const query = new URLSearchParams();
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.zone_id) query.set('zone_id', params.zone_id);
    if (params?.household_id) query.set('household_id', params.household_id);
    const qs = query.toString();
    return fetchJson<TimeseriesResponse>(`/api/energy/timeseries${qs ? `?${qs}` : ''}`);
  },

  // 3. Paginated Readings
  async getReadings(params?: {
    page?: number;
    page_size?: number;
    zone_id?: string;
    household_id?: string;
    meter_id?: string;
    status?: 'all' | 'valid' | 'invalid';
    start_time?: string;
    end_time?: string;
  }): Promise<PaginatedReadings> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.page_size) query.set('page_size', params.page_size.toString());
    if (params?.zone_id) query.set('zone_id', params.zone_id);
    if (params?.household_id) query.set('household_id', params.household_id);
    if (params?.meter_id) query.set('meter_id', params.meter_id);
    if (params?.status) query.set('status', params.status);
    if (params?.start_time) query.set('start_time', params.start_time);
    if (params?.end_time) query.set('end_time', params.end_time);
    const qs = query.toString();
    return fetchJson<PaginatedReadings>(`/api/readings${qs ? `?${qs}` : ''}`);
  },

  // 4. Dynamic Zones
  async getZones(): Promise<{ sim_day: string | null; zones_count: number; zones: ZoneSummary[] }> {
    return fetchJson<{ sim_day: string | null; zones_count: number; zones: ZoneSummary[] }>('/api/zones');
  },

  // 5. Households
  async getHouseholds(params?: { zone_id?: string }): Promise<{
    sim_day: string | null;
    total: number;
    households: HouseholdItem[];
  }> {
    const query = new URLSearchParams();
    if (params?.zone_id) query.set('zone_id', params.zone_id);
    const qs = query.toString();
    return fetchJson<{ sim_day: string | null; total: number; households: HouseholdItem[] }>(
      `/api/households${qs ? `?${qs}` : ''}`
    );
  },

  async getHouseholdDetail(householdId: string): Promise<HouseholdDetailResponse> {
    return fetchJson<HouseholdDetailResponse>(`/api/households/${encodeURIComponent(householdId)}`);
  },

  // 6. Bills
  async getBills(params?: { day?: string; zone_id?: string; household_id?: string }): Promise<BillsResponse> {
    const query = new URLSearchParams();
    if (params?.day) query.set('day', params.day);
    if (params?.zone_id) query.set('zone_id', params.zone_id);
    if (params?.household_id) query.set('household_id', params.household_id);
    const qs = query.toString();
    return fetchJson<BillsResponse>(`/api/bills${qs ? `?${qs}` : ''}`);
  },

  async getBillDetail(billId: string): Promise<any> {
    return fetchJson<any>(`/api/bills/${encodeURIComponent(billId)}`);
  },

  // 7. Alerts & Health
  async getAlerts(): Promise<any> {
    return fetchJson<any>('/api/alerts');
  },

  async getHealth(): Promise<HealthResponse> {
    return fetchJson<HealthResponse>('/health');
  },

  async acknowledgeAlert(alertId: string): Promise<{ status: string; alert_id: string }> {
    return fetchJson<{ status: string; alert_id: string }>(`/api/alerts/${encodeURIComponent(alertId)}/ack`, {
      method: 'POST',
    });
  },
};
