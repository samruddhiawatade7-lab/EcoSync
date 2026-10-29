import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { PageHeader } from '../components/layout/PageHeader';
import { PillButton } from '../components/ui/PillButton';
import { StatusChip } from '../components/ui/StatusChip';
import { CardSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Activity,
  Filter,
  RefreshCw,
  FileDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Zap,
  Sun,
  AlertCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export const EnergyMonitoringPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [selectedHousehold, setSelectedHousehold] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'valid' | 'invalid'>('all');

  // Fetch dynamic zones for dropdown
  const { data: zonesData } = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.getZones(),
  });

  // Fetch dynamic households for dropdown
  const { data: householdsData } = useQuery({
    queryKey: ['households', selectedZone],
    queryFn: () => api.getHouseholds({ zone_id: selectedZone || undefined }),
  });

  // Fetch paginated readings
  const {
    data: readingsData,
    isLoading: isReadingsLoading,
    isError: isReadingsError,
    error: readingsError,
    refetch: refetchReadings,
    isFetching: isReadingsFetching,
  } = useQuery({
    queryKey: ['readings', page, pageSize, selectedZone, selectedHousehold, selectedStatus],
    queryFn: () =>
      api.getReadings({
        page,
        page_size: pageSize,
        zone_id: selectedZone || undefined,
        household_id: selectedHousehold || undefined,
        status: selectedStatus,
      }),
    refetchInterval: 5000,
  });

  // Fetch timeseries for chart
  const {
    data: timeseriesData,
    isLoading: isTimeseriesLoading,
  } = useQuery({
    queryKey: ['energy-timeseries', selectedZone, selectedHousehold],
    queryFn: () =>
      api.getEnergyTimeseries({
        zone_id: selectedZone || undefined,
        household_id: selectedHousehold || undefined,
      }),
    refetchInterval: 10000,
  });

  const exportReadingsCsv = () => {
    if (!readingsData || !readingsData.items.length) return;
    const headers = [
      'event_id',
      'meter_id',
      'household_id',
      'zone_id',
      'event_time',
      'consumption_kwh',
      'solar_kwh',
      'estimated_net_kwh',
      'kafka_partition',
      'kafka_offset',
      'status',
      'error_reason',
    ];
    const rows = readingsData.items.map((i) => [
      i.event_id,
      i.meter_id,
      i.household_id,
      i.zone_id,
      i.event_time,
      i.consumption_kwh,
      i.solar_kwh,
      i.estimated_net_kwh,
      i.kafka_partition,
      i.kafka_offset,
      i.status,
      i.error_reason || '',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartgrid-readings-page-${page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetFilters = () => {
    setSelectedZone('');
    setSelectedHousehold('');
    setSelectedStatus('all');
    setPage(1);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Energy Monitoring"
        subtitle="Auto-refreshing live smart meter readings and load profile analysis."
        actions={
          <>
            <PillButton
              variant="secondary"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isReadingsFetching ? 'animate-spin' : ''}`} />}
              onClick={() => refetchReadings()}
            >
              {isReadingsFetching ? 'Updating...' : 'Refresh'}
            </PillButton>
            <PillButton
              variant="secondary"
              icon={<FileDown className="w-4 h-4" />}
              onClick={exportReadingsCsv}
              disabled={!readingsData?.items.length}
            >
              Export CSV
            </PillButton>
          </>
        }
      />

      {/* Filter Toolbar Card */}
      <div className="rounded-3xl p-5 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
            <Filter className="w-4 h-4 text-[#14532D]" />
            <span>Filter Telemetry</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Zone Filter */}
            <select
              value={selectedZone}
              onChange={(e) => {
                setSelectedZone(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200/80 rounded-full px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
            >
              <option value="">All Zones (Dynamic)</option>
              {zonesData?.zones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  Zone {z.zone_id} ({z.households_count} meters)
                </option>
              ))}
            </select>

            {/* Household Filter */}
            <select
              value={selectedHousehold}
              onChange={(e) => {
                setSelectedHousehold(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200/80 rounded-full px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
            >
              <option value="">All Households</option>
              {householdsData?.households.map((h) => (
                <option key={h.household_id} value={h.household_id}>
                  {h.household_id} (Meter {h.meter_id})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as any);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200/80 rounded-full px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
            >
              <option value="all">All Readings (Valid + DLQ)</option>
              <option value="valid">Valid Master Ingestions</option>
              <option value="invalid">Invalid / Rejected (DLQ)</option>
            </select>

            {(selectedZone || selectedHousehold || selectedStatus !== 'all') && (
              <button
                onClick={resetFilters}
                className="text-xs text-rose-600 font-semibold hover:underline px-2"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Aggregate Timeseries Chart */}
      <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#14532D]" />
              Grid Load Curve & Generation
            </h3>
            <p className="text-xs text-slate-400">
              Aggregated speed-layer windows {selectedZone ? `· Zone ${selectedZone}` : ''}{' '}
              {selectedHousehold ? `· Household ${selectedHousehold}` : ''}
            </p>
          </div>

          {timeseriesData?.summary && (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-[#14532D]" />
                Total Cons: <span className="font-bold text-slate-900">{timeseriesData.summary.total_consumption_kwh.toFixed(1)} kWh</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Total Solar: <span className="font-bold">{timeseriesData.summary.total_solar_kwh.toFixed(1)} kWh</span>
              </div>
            </div>
          )}
        </div>

        <div className="h-64 w-full">
          {isTimeseriesLoading ? (
            <div className="h-full flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          ) : timeseriesData?.timeseries?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseriesData.timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCons" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14532D" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#14532D" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
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
                  dataKey="consumption_kwh"
                  name="Consumption (kWh)"
                  stroke="#14532D"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorCons)"
                />
                <Area
                  type="monotone"
                  dataKey="solar_kwh"
                  name="Solar (kWh)"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSolar)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-400">
              No window series available for this selection.
            </div>
          )}
        </div>
      </div>

      {/* Paginated Readings Table */}
      <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Server-Paginated Meter Readings</h3>
            <p className="text-xs text-slate-400">
              Direct from Spark raw sink ({readingsData?.total?.toLocaleString() || 0} total records recorded)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200/80 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {isReadingsLoading ? (
          <div className="space-y-3 py-8">
            <CardSkeleton />
          </div>
        ) : isReadingsError ? (
          <ErrorState
            title="Could not load meter readings"
            message={(readingsError as Error)?.message || 'Database error while fetching paginated readings.'}
            onRetry={() => refetchReadings()}
          />
        ) : !readingsData?.items?.length ? (
          <EmptyState
            title="No readings found"
            message="No readings match your filter criteria. Try clearing zone or household filters."
            action={
              <PillButton variant="secondary" onClick={resetFilters}>
                Clear Filters
              </PillButton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-3">Event Time</th>
                  <th className="py-3 px-3">Meter ID</th>
                  <th className="py-3 px-3">Household</th>
                  <th className="py-3 px-3">Zone</th>
                  <th className="py-3 px-3 text-right">Consumption</th>
                  <th className="py-3 px-3 text-right">Solar</th>
                  <th className="py-3 px-3 text-right">Net Energy</th>
                  <th className="py-3 px-3">Kafka Offset</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium">
                {readingsData.items.map((r) => (
                  <tr key={r.event_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {new Date(r.event_time).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500">{r.meter_id}</td>
                    <td className="py-3 px-3 font-bold text-slate-800">{r.household_id}</td>
                    <td className="py-3 px-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {r.zone_id}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                      {r.consumption_kwh.toFixed(3)} <span className="text-[10px] text-slate-400 font-normal">kWh</span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-600">
                      {r.solar_kwh.toFixed(3)} <span className="text-[10px] text-emerald-400 font-normal">kWh</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">
                      {r.estimated_net_kwh.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                      P{r.kafka_partition}:#{r.kafka_offset}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.status === 'valid' ? (
                        <StatusChip status="online" label="Valid" />
                      ) : (
                        <span
                          title={r.error_reason || 'Rejected by Spark validation'}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-help"
                        >
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          DLQ
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {readingsData && readingsData.total_pages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
            <div>
              Showing page <strong className="text-slate-800">{readingsData.page}</strong> of{' '}
              <strong className="text-slate-800">{readingsData.total_pages}</strong> (
              {readingsData.total.toLocaleString()} total readings)
            </div>

            <div className="flex items-center gap-2">
              <PillButton
                variant="secondary"
                size="sm"
                icon={<ChevronLeft className="w-4 h-4" />}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </PillButton>
              <PillButton
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(readingsData.total_pages, p + 1))}
                disabled={page >= readingsData.total_pages}
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </PillButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
