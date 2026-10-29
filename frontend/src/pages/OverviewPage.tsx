import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { PageHeader } from '../components/layout/PageHeader';
import { KpiCard } from '../components/ui/KpiCard';
import { PillButton } from '../components/ui/PillButton';
import { DonutProgress } from '../components/ui/DonutProgress';
import { StatusChip } from '../components/ui/StatusChip';
import { CardSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import {
  Zap,
  Sun,
  ShieldCheck,
  RefreshCw,
  FileDown,
  Info,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('Last 24 Hours');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.getOverview(),
    refetchInterval: 5000, // Live 5-second polling matching telemetry interval
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Energy Dashboard"
          subtitle="Monitor and optimize your renewable energy flow in real-time."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CardSkeleton />
          <div className="lg:col-span-2">
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Energy Dashboard"
          subtitle="Monitor and optimize your renewable energy flow in real-time."
        />
        <ErrorState
          title="Telemetry Service Disconnected"
          message={(error as Error)?.message || 'Failed to fetch live overview data from FastAPI backend.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const { kpis, badges, pipeline_status, hourly_usage, zone_comparison, household_rankings, recent_readings } = data;

  // Graded green palette for rounded bars matching reference screenshot
  const gradedGreens = ['#C6DCCB', '#B4D5BD', '#9DBFA9', '#7FAFA8', '#5E9C78', '#3E7D58', '#14532D'];

  // Format time since last sync
  const lastSyncText = pipeline_status.latest_reading_age_seconds !== null
    ? `${Math.round(pipeline_status.latest_reading_age_seconds)}s ago`
    : 'No telemetry';

  const exportSummaryCsv = () => {
    const rows = [
      ['Metric', 'Value', 'Unit'],
      ['Total Energy Consumed', kpis.total_consumption_kwh, 'kWh'],
      ['Solar Energy Generated', kpis.total_solar_kwh, 'kWh'],
      ['Estimated Net Grid Energy', kpis.estimated_net_kwh, 'kWh'],
      ['Total Estimated Bill', kpis.total_bill_amount, 'LKR / INR'],
      ['Active Smart Meters', kpis.active_meters_count, 'meters'],
      ['Solar Contribution', kpis.solar_contribution_pct, '%'],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartgrid-overview-${data.sim_day || 'report'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Energy Dashboard"
        subtitle="Monitor and optimize your renewable energy flow in real-time."
        actions={
          <>
            <PillButton
              variant="secondary"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
              onClick={() => refetch()}
            >
              {isFetching ? 'Refreshing...' : 'Refresh'}
            </PillButton>
            <PillButton
              variant="secondary"
              icon={<FileDown className="w-4 h-4" />}
              onClick={exportSummaryCsv}
            >
              Export Report
            </PillButton>
            <PillButton
              variant="primary"
              icon={<Zap className="w-4 h-4" />}
              onClick={() => navigate('/monitoring')}
            >
              Live Telemetry
            </PillButton>
          </>
        }
      />

      {/* Hero KPI Row (4 Cards, anchored by Featured Deep Green Card on the top-left) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Featured Forest Green KPI Card */}
        <KpiCard
          featured
          title="Total Energy Consumed"
          value={kpis.total_consumption_kwh.toLocaleString()}
          unit="kWh"
          badge={badges?.total_consumption}
          subtext="Live Grid Telemetry"
        />

        {/* Card 2: Current Consumption / Solar Generation */}
        <KpiCard
          title="Solar Energy Generated"
          value={kpis.total_solar_kwh.toLocaleString()}
          unit="kWh"
          badge={badges?.solar_generation}
          icon={<Sun className="w-4 h-4 text-emerald-600" />}
          statusType="ok"
          statusText={`${kpis.solar_contribution_pct}% Solar Contribution`}
          onClick={() => navigate('/solar')}
        />

        {/* Card 3: Estimated Bill */}
        <KpiCard
          title="Estimated Daily Bill"
          value={`₹${kpis.total_bill_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          unit=""
          badge={badges?.estimated_bill}
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          statusType={kpis.is_billed_final ? 'ok' : 'warning'}
          statusText={kpis.is_billed_final ? 'Airflow Batch Finalized' : 'Running estimate (in progress)'}
          onClick={() => navigate('/billing')}
        />

        {/* Card 4: Grid & Pipeline Status */}
        <div className="rounded-3xl p-6 bg-white text-slate-900 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <span className="text-slate-500 text-sm font-medium tracking-wide">Grid Pipeline</span>
            <div className="w-9 h-9 rounded-full bg-slate-100/70 flex items-center justify-center text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
          </div>

          <div className="my-2">
            <div className="flex items-center gap-2">
              <StatusChip status={pipeline_status.overall === 'healthy' ? 'online' : 'degraded'} label="Pipeline Online" />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Sync: {lastSyncText}
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {kpis.active_meters_count} / {kpis.total_households_count} meters
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts Row: Savings Progress (Donut) + Real-time Usage (Rounded Bar Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Savings Progress (Thick-stroke Donut) */}
        <DonutProgress
          title="Savings Progress"
          percentage={kpis.solar_contribution_pct}
          label="SOLAR CONTRIBUTION"
          items={[
            {
              label: 'Eco Solar Gen',
              value: `${kpis.total_solar_kwh.toLocaleString()} kWh`,
              color: '#14532D',
            },
            {
              label: 'Net Grid Draw',
              value: `${Math.max(0, kpis.estimated_net_kwh).toLocaleString()} kWh`,
              color: '#9DBFA9',
            },
            {
              label: 'Est. Daily Total',
              value: `₹${kpis.total_bill_amount.toLocaleString()}`,
              color: '#3B82F6',
            },
          ]}
        />

        {/* Right: Real-time Usage (Rounded Bar Chart with Peak Tooltip) */}
        <div className="lg:col-span-2 rounded-3xl p-6 bg-white border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Real-time Usage</h3>
              <p className="text-xs text-slate-400 mt-0.5">Power consumption by 2-hour window (kWh)</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-slate-50 border border-slate-200/80 text-xs font-semibold rounded-full px-4 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
              >
                <option>Last 24 Hours</option>
                <option>Active Day</option>
              </select>
            </div>
          </div>

          <div className="h-64 w-full">
            {hourly_usage.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly_usage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="time_label"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(20, 83, 45, 0.04)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const val = payload[0].value as number;
                        return (
                          <div className="bg-[#0F172A] text-white px-3 py-1.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span>{val.toFixed(2)} kWh</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="consumption_kwh"
                    radius={[10, 10, 0, 0]}
                    maxBarSize={48}
                  >
                    {hourly_usage.map((entry, index) => {
                      const isPeak = entry.is_peak;
                      const color = isPeak
                        ? '#14532D' // Highlighted peak bar
                        : gradedGreens[index % gradedGreens.length];
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Waiting for 2-hour window aggregates from Spark streaming layer...
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#14532D]" />
                Peak Window
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9DBFA9]" />
                Standard Window
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Simulated Clock: {data.sim_day || '2026-01-01'}
            </span>
          </div>
        </div>
      </div>

      {/* Net Grid Energy Assumption Banner */}
      <div className="rounded-2xl p-4 bg-emerald-50/60 border border-emerald-100 flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-emerald-900 mr-2">Net Grid Energy Calculation:</span>
            <span className="text-emerald-800">
              {kpis.estimated_net_kwh.toLocaleString()} kWh (Consumption {kpis.total_consumption_kwh} kWh − Solar {kpis.total_solar_kwh} kWh).
            </span>
            <span className="block text-[11px] text-emerald-700/80 mt-0.5">
              Labelled as <strong>Estimate (derived)</strong>. Instantaneous import/export telemetry not provided by baseline smart meters.
            </span>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-200/80 text-emerald-900 flex-shrink-0">
          Estimate (derived)
        </span>
      </div>

      {/* Secondary Row: Consumption vs Solar Trend Line Chart + Zone Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Real-time Trend Line Chart */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Energy Flow Profile</h3>
              <p className="text-xs text-slate-400">Consumption vs Solar generation across windows</p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              Live Stream
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourly_usage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time_label" stroke="#94A3B8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderRadius: 12, border: 'none', color: '#FFF' }}
                />
                <Line
                  type="monotone"
                  dataKey="consumption_kwh"
                  name="Consumption"
                  stroke="#14532D"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#14532D' }}
                />
                <Line
                  type="monotone"
                  dataKey="solar_kwh"
                  name="Solar Gen"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dynamic Zone Comparison */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Zone Balance Summary</h3>
              <p className="text-xs text-slate-400">Dynamically discovered zones and solar shares</p>
            </div>
            <button
              onClick={() => navigate('/households')}
              className="text-xs font-semibold text-[#14532D] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {zone_comparison.map((z) => (
              <div
                key={z.zone_id}
                className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#14532D] text-white font-bold flex items-center justify-center text-xs">
                    {z.zone_id}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{z.zone_id} Grid Sector</div>
                    <div className="text-[11px] text-slate-400">
                      {z.households_count} households · {z.solar_households_count} solar
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-slate-900 text-sm">
                    {z.day_consumption_kwh.toFixed(1)} <span className="text-xs font-normal text-slate-500">kWh</span>
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-600">
                    {z.solar_contribution_pct}% renewable
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Dynamic Discovery (Database)</span>
            <span>{zone_comparison.length} Active Zones</span>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Recent Raw Readings Stream & Household Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Readings Stream */}
        <div className="lg:col-span-2 rounded-3xl p-6 bg-white border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Live Ingestion Stream</h3>
              <p className="text-xs text-slate-400">Latest valid readings committed to PostgreSQL master table</p>
            </div>
            <button
              onClick={() => navigate('/monitoring')}
              className="text-xs font-semibold text-[#14532D] hover:underline flex items-center gap-1"
            >
              Full explorer <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Event Time</th>
                  <th className="py-2.5 px-3">Household</th>
                  <th className="py-2.5 px-3">Zone</th>
                  <th className="py-2.5 px-3 text-right">Consumption</th>
                  <th className="py-2.5 px-3 text-right">Solar</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium">
                {recent_readings.map((r) => (
                  <tr key={r.event_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {new Date(r.event_time).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{r.household_id}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                        {r.zone_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                      {r.consumption_kwh.toFixed(3)} kWh
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">
                      {r.solar_kwh.toFixed(3)} kWh
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <StatusChip status="online" label="Valid" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Consumers Ranking */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Top Load Ranking</h3>
            <p className="text-xs text-slate-400 mb-4">Highest consuming households today</p>

            <div className="space-y-3">
              {household_rankings.top_consumers.map((h, idx) => (
                <div
                  key={h.household_id}
                  onClick={() => navigate(`/households?selected=${h.household_id}`)}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{h.household_id}</div>
                      <div className="text-[11px] text-slate-400">Meter {h.meter_id} · {h.zone_id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-slate-900 text-sm">
                      {h.consumption_kwh.toFixed(2)} <span className="text-[11px] font-normal text-slate-500">kWh</span>
                    </div>
                    <div className="text-[11px] text-emerald-600 font-semibold">
                      +{h.solar_kwh.toFixed(2)} kWh solar
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Ranked by event-time consumption</span>
            <span className="font-semibold text-[#14532D]">Top 5</span>
          </div>
        </div>
      </div>
    </div>
  );
};
