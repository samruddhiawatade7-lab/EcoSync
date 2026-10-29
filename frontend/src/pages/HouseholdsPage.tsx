import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { PageHeader } from '../components/layout/PageHeader';
import { PillButton } from '../components/ui/PillButton';
import { StatusChip } from '../components/ui/StatusChip';
import { CardSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { HouseholdItem, HouseholdDetailResponse } from '../types';
import {
  Users,
  Home,
  Sun,
  Zap,
  RefreshCw,
  Search,
  ChevronRight,
  X,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
} from 'recharts';

export const HouseholdsPage: React.FC = () => {
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  // Fetch zones
  const { data: zonesData } = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.getZones(),
  });

  // Fetch households
  const {
    data: householdsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['households', selectedZone],
    queryFn: () => api.getHouseholds({ zone_id: selectedZone || undefined }),
    refetchInterval: 8000,
  });

  // Fetch detail for selected household
  const {
    data: detailData,
    isLoading: isDetailLoading,
  } = useQuery({
    queryKey: ['household-detail', selectedHouseholdId],
    queryFn: () => api.getHouseholdDetail(selectedHouseholdId!),
    enabled: !!selectedHouseholdId,
  });

  const households = householdsData?.households || [];
  const filtered = households.filter((h) =>
    searchTerm
      ? h.household_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.meter_id.toLowerCase().includes(searchTerm.toLowerCase())
      : true
  );

  const zonesList = zonesData?.zones || [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Households & Zones"
        subtitle="Dynamic meter registry, household profiles, and zone aggregate distribution."
        actions={
          <PillButton
            variant="secondary"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            onClick={() => refetch()}
          >
            {isFetching ? 'Updating...' : 'Refresh'}
          </PillButton>
        }
      />

      {/* Zone Summaries Row (Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {zonesList.map((z, idx) => (
          <div
            key={z.zone_id}
            onClick={() => setSelectedZone(selectedZone === z.zone_id ? '' : z.zone_id)}
            className={`rounded-3xl p-6 border transition-all cursor-pointer ${
              selectedZone === z.zone_id
                ? 'bg-[#14532D] text-white border-[#14532D] shadow-md shadow-emerald-950/15'
                : 'bg-white text-slate-900 border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    selectedZone === z.zone_id ? 'bg-white/20 text-white' : 'bg-[#14532D] text-white'
                  }`}
                >
                  {z.zone_id}
                </div>
                <div>
                  <h4 className="font-extrabold text-base tracking-tight">Zone {z.zone_id}</h4>
                  <p className={`text-xs ${selectedZone === z.zone_id ? 'text-white/70' : 'text-slate-400'}`}>
                    {z.households_count} meters ({z.solar_households_count} solar)
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  selectedZone === z.zone_id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {selectedZone === z.zone_id ? 'Selected' : 'Filter'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 my-2">
              <div>
                <span className={`text-[11px] block ${selectedZone === z.zone_id ? 'text-white/70' : 'text-slate-400'}`}>
                  Consumption
                </span>
                <span className="text-xl font-bold tracking-tight">
                  {z.day_consumption_kwh.toFixed(1)} <span className="text-xs font-normal">kWh</span>
                </span>
              </div>
              <div>
                <span className={`text-[11px] block ${selectedZone === z.zone_id ? 'text-white/70' : 'text-slate-400'}`}>
                  Solar Generated
                </span>
                <span
                  className={`text-xl font-bold tracking-tight ${
                    selectedZone === z.zone_id ? 'text-emerald-300' : 'text-emerald-600'
                  }`}
                >
                  {z.day_solar_kwh.toFixed(1)} <span className="text-xs font-normal">kWh</span>
                </span>
              </div>
            </div>

            <div
              className={`mt-4 pt-3 border-t text-xs flex justify-between items-center ${
                selectedZone === z.zone_id ? 'border-white/20 text-white/80' : 'border-slate-100 text-slate-500'
              }`}
            >
              <span>Renewable Ratio:</span>
              <span className="font-bold">{z.solar_contribution_pct}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Household Registry Table Card */}
      <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ID or meter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 border border-slate-200/80 rounded-full pl-10 pr-4 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
              />
            </div>

            {selectedZone && (
              <span className="text-xs text-[#14532D] font-semibold bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-1.5">
                Filtered by Zone {selectedZone}
                <button onClick={() => setSelectedZone('')} className="hover:text-rose-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>

          <span className="text-xs text-slate-500">
            Showing {filtered.length} of {households.length} registered households
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-4 py-8">
            <CardSkeleton />
          </div>
        ) : isError ? (
          <ErrorState
            title="Failed to load households"
            message={(error as Error)?.message || 'Database connection error.'}
            onRetry={() => refetch()}
          />
        ) : !filtered.length ? (
          <EmptyState title="No households found" message="No households match your filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-3">Household ID</th>
                  <th className="py-3 px-3">Meter ID</th>
                  <th className="py-3 px-3">Zone</th>
                  <th className="py-3 px-3">Solar PV</th>
                  <th className="py-3 px-3 text-right">Consumption</th>
                  <th className="py-3 px-3 text-right">Solar</th>
                  <th className="py-3 px-3 text-right">Est. Bill</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium">
                {filtered.map((h) => (
                  <tr
                    key={h.household_id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      selectedHouseholdId === h.household_id ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-extrabold text-slate-900">{h.household_id}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{h.meter_id}</td>
                    <td className="py-3 px-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {h.zone_id}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {h.has_solar ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <Sun className="w-3.5 h-3.5 text-emerald-500" />
                          {h.solar_capacity_kw.toFixed(1)} kW
                        </span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                      {h.consumption_kwh.toFixed(2)} kWh
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-emerald-600">
                      {h.solar_kwh.toFixed(2)} kWh
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                      ₹{h.bill_amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <StatusChip status={h.bill_status === 'Final' ? 'Final' : 'Estimate'} label={h.bill_status} />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setSelectedHouseholdId(h.household_id)}
                        className="px-3 py-1 rounded-full text-xs font-semibold text-[#14532D] hover:bg-emerald-50 transition-colors flex items-center gap-1 mx-auto"
                      >
                        Details <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Household Deep Drilldown Drawer / Modal */}
      {selectedHouseholdId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl p-6 sm:p-8 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#14532D] text-white flex items-center justify-center font-bold">
                    <Home className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">{selectedHouseholdId} Deep Dive</h3>
                    <p className="text-xs text-slate-400">
                      Smart Meter {detailData?.info.meter_id || 'M...'} · Zone {detailData?.info.zone_id || 'Z...'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedHouseholdId(null)}
                  className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isDetailLoading ? (
                <div className="space-y-4">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : detailData ? (
                <div className="space-y-6">
                  {/* Today Summary Row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 block font-medium">Consumption</span>
                      <span className="text-lg font-extrabold text-slate-900">
                        {detailData.today_summary.consumption_kwh.toFixed(2)} kWh
                      </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                      <span className="text-[11px] text-emerald-700 block font-medium">Solar Gen</span>
                      <span className="text-lg font-extrabold text-emerald-800">
                        {detailData.today_summary.solar_kwh.toFixed(2)} kWh
                      </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 block font-medium">Net Draw (Est.)</span>
                      <span className="text-lg font-extrabold text-slate-900">
                        {detailData.today_summary.estimated_net_kwh.toFixed(2)} kWh
                      </span>
                    </div>
                  </div>

                  {/* 24-Hour Load Curve */}
                  <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
                    <h4 className="font-bold text-slate-800 text-sm mb-1">2-Hour Load Curve</h4>
                    <p className="text-xs text-slate-400 mb-4">Event-time windows from Spark speed layer</p>
                    <div className="h-48 w-full">
                      {detailData.load_curve.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={detailData.load_curve} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                            <XAxis dataKey="time_label" stroke="#94A3B8" fontSize={10} tickLine={false} />
                            <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#0F172A',
                                borderRadius: 10,
                                border: 'none',
                                color: '#FFF',
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="consumption_kwh"
                              name="Consumption"
                              stroke="#14532D"
                              strokeWidth={2}
                              dot={{ r: 2 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="solar_kwh"
                              name="Solar"
                              stroke="#10B981"
                              strokeWidth={2}
                              strokeDasharray="3 3"
                              dot={{ r: 2 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          No window readings recorded yet for this household.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Historical Invoices */}
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm mb-3">Settled Invoice History</h4>
                    {detailData.bills_history.length > 0 ? (
                      <div className="space-y-2">
                        {detailData.bills_history.map((b) => (
                          <div
                            key={b.bill_date}
                            className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                          >
                            <span className="font-mono text-slate-600">{b.bill_date}</span>
                            <span>{Number(b.consumption_kwh).toFixed(2)} kWh</span>
                            <span className="font-bold text-slate-900">₹{Number(b.bill_lkr).toFixed(2)}</span>
                            <StatusChip status="Final" label="Settled" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No batch-settled bills found yet.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <PillButton variant="secondary" onClick={() => setSelectedHouseholdId(null)}>
                Close
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
