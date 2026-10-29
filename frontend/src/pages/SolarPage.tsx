import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { PageHeader } from '../components/layout/PageHeader';
import { KpiCard } from '../components/ui/KpiCard';
import { PillButton } from '../components/ui/PillButton';
import { DonutProgress } from '../components/ui/DonutProgress';
import { CardSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import {
  Sun,
  Zap,
  Info,
  RefreshCw,
  FileDown,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

export const SolarPage: React.FC = () => {
  const {
    data: overviewData,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    error: overviewError,
    refetch: refetchOverview,
    isFetching,
  } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.getOverview(),
    refetchInterval: 5000,
  });

  const { data: householdsData } = useQuery({
    queryKey: ['households'],
    queryFn: () => api.getHouseholds(),
  });

  if (isOverviewLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Solar & Renewables" subtitle="Micro-generation analytics, solar contribution, and zone solar quotas." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (isOverviewError || !overviewData) {
    return (
      <div className="space-y-6">
        <PageHeader title="Solar & Renewables" subtitle="Micro-generation analytics, solar contribution, and zone solar quotas." />
        <ErrorState
          title="Solar Telemetry Unavailable"
          message={(overviewError as Error)?.message || 'Failed to fetch solar data.'}
          onRetry={() => refetchOverview()}
        />
      </div>
    );
  }

  const { kpis, zone_comparison, hourly_usage, household_rankings } = overviewData;

  // Filter households that have solar
  const solarHouseholds = householdsData?.households.filter((h) => h.has_solar) || [];
  const totalInstalledCapacityKw = solarHouseholds.reduce((acc, h) => acc + (h.solar_capacity_kw || 0), 0);

  const exportSolarCsv = () => {
    const rows = [
      ['Household ID', 'Zone ID', 'Solar Capacity (kW)', 'Solar Generation (kWh)', 'Consumption (kWh)', 'Solar Share %'],
      ...solarHouseholds.map((h) => [
        h.household_id,
        h.zone_id,
        h.solar_capacity_kw,
        h.solar_kwh,
        h.consumption_kwh,
        h.solar_share_pct,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartgrid-solar-report-${overviewData.sim_day || 'today'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Solar & Renewables"
        subtitle="Micro-generation analytics, solar contribution, and zone solar quotas."
        actions={
          <>
            <PillButton
              variant="secondary"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
              onClick={() => refetchOverview()}
            >
              {isFetching ? 'Updating...' : 'Refresh'}
            </PillButton>
            <PillButton variant="secondary" icon={<FileDown className="w-4 h-4" />} onClick={exportSolarCsv}>
              Export Solar CSV
            </PillButton>
          </>
        }
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          featured
          title="Total Solar Generated"
          value={kpis.total_solar_kwh.toLocaleString()}
          unit="kWh"
          badge={{ type: 'Live', tooltip: 'Sum of real-time solar generation across all equipped households.' }}
          subtext="Active Microgeneration"
        />

        <KpiCard
          title="Solar Contribution Share"
          value={`${kpis.solar_contribution_pct}%`}
          unit=""
          badge={{ type: 'Live', tooltip: 'Solar kWh divided by Total Consumption kWh' }}
          icon={<Sun className="w-4 h-4 text-emerald-600" />}
          statusType="ok"
          statusText="Of total grid demand satisfied"
        />

        <KpiCard
          title="Installed Solar Capacity"
          value={totalInstalledCapacityKw.toFixed(1)}
          unit="kWp"
          badge={{ type: 'Historical', tooltip: 'Total registered PV capacity across meters' }}
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          statusType="info"
          statusText={`${solarHouseholds.length} solar-enabled homes`}
        />

        <KpiCard
          title="Derived Net Grid Energy"
          value={kpis.estimated_net_kwh.toLocaleString()}
          unit="kWh"
          badge={{ type: 'Estimate', tooltip: 'Net energy estimate: Consumption - Solar' }}
          icon={<Info className="w-4 h-4 text-slate-500" />}
          statusType="info"
          statusText="Instantaneous export not metered"
        />
      </div>

      {/* Crucial Distinctions Notice */}
      <div className="rounded-2xl p-4 bg-amber-50/70 border border-amber-200/60 flex items-start gap-3 text-xs">
        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-amber-900">Important Solar Telemetry Distinction:</span>
          <p className="text-amber-800 mt-0.5">
            <strong>Generated Solar</strong> represents total energy produced by rooftop solar panels. This is strictly separated from <strong>Exported Solar</strong>. In this grid setup, bidirectional feed-in export meters are not installed, so all net energy figures are labelled as <em>Estimate (derived)</em> where Net = Consumption − Generation. No solar export credits or feed-in tariffs are applied to bills.
          </p>
        </div>
      </div>

      {/* Generation Over Time Curve & Donut Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Solar Contribution Donut */}
        <DonutProgress
          title="Solar Contribution Mix"
          percentage={kpis.solar_contribution_pct}
          label="RENEWABLE RATIO"
          items={[
            {
              label: 'Solar Ingestion',
              value: `${kpis.total_solar_kwh.toFixed(1)} kWh`,
              color: '#10B981',
            },
            {
              label: 'Grid Ingestion',
              value: `${Math.max(0, kpis.estimated_net_kwh).toFixed(1)} kWh`,
              color: '#14532D',
            },
          ]}
        />

        {/* Right: Generation Curve Across Time */}
        <div className="lg:col-span-2 rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Sun className="w-5 h-5 text-emerald-600" />
                Solar Generation Curve (Daylight Profile)
              </h3>
              <p className="text-xs text-slate-400">Peak generation between 10:00 and 14:00 simulated solar time</p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              Daylight Window
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourly_usage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="solarArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time_label" stroke="#94A3B8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderRadius: 12, border: 'none', color: '#FFF' }}
                />
                <Area
                  type="monotone"
                  dataKey="solar_kwh"
                  name="Solar Generation"
                  stroke="#10B981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#solarArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Simulated Solar Time (Solar noon = 12:00 UTC)</span>
            <span className="font-semibold text-emerald-700">Dynamic Telemetry</span>
          </div>
        </div>
      </div>

      {/* Solar By Zone & Top Producers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Zone Breakdown */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
          <h3 className="font-bold text-slate-900 text-base mb-1">Solar Generation by Zone</h3>
          <p className="text-xs text-slate-400 mb-6">Aggregate kWh produced per dynamic grid sector</p>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zone_comparison} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="zone_id" stroke="#94A3B8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderRadius: 12, border: 'none', color: '#FFF' }}
                />
                <Bar dataKey="day_solar_kwh" name="Solar Gen (kWh)" fill="#10B981" radius={[8, 8, 0, 0]} maxBarSize={48}>
                  {zone_comparison.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={['#10B981', '#5E9C78', '#14532D'][idx % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Solar Producers */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Top Solar Producers</h3>
            <p className="text-xs text-slate-400 mb-4">Households with highest solar generation today</p>

            <div className="space-y-3">
              {household_rankings.top_producers.map((h, idx) => (
                <div
                  key={h.household_id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{h.household_id}</div>
                      <div className="text-[11px] text-slate-400">Meter {h.meter_id} · {h.zone_id}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-extrabold text-emerald-700 text-sm">
                      {h.solar_kwh.toFixed(2)} <span className="text-[11px] font-normal text-slate-400">kWh</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {h.solar_contribution_pct}% of household load
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Rooftop solar generation</span>
            <span className="font-semibold text-emerald-600">Top 5</span>
          </div>
        </div>
      </div>
    </div>
  );
};
