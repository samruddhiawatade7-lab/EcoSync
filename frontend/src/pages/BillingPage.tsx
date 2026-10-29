import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { PageHeader } from '../components/layout/PageHeader';
import { KpiCard } from '../components/ui/KpiCard';
import { PillButton } from '../components/ui/PillButton';
import { StatusChip } from '../components/ui/StatusChip';
import { CardSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { BillItem } from '../types';
import {
  Receipt,
  FileDown,
  Printer,
  Calendar,
  Filter,
  RefreshCw,
  X,
  Search,
  CheckCircle,
  HelpCircle,
  Clock,
  Layers,
} from 'lucide-react';

export const BillingPage: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [searchHousehold, setSearchHousehold] = useState<string>('');
  const [activeModalBill, setActiveModalBill] = useState<BillItem | null>(null);

  // Fetch dynamic zones for filter
  const { data: zonesData } = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.getZones(),
  });

  // Fetch bills
  const {
    data: billsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['bills', selectedDay, selectedZone],
    queryFn: () =>
      api.getBills({
        day: selectedDay || undefined,
        zone_id: selectedZone || undefined,
      }),
    refetchInterval: 10000,
  });

  const billsList = billsData?.bills || [];
  const filteredBills = billsList.filter((b) =>
    searchHousehold ? b.household_id.toLowerCase().includes(searchHousehold.toLowerCase()) : true
  );

  const exportBillsCsv = () => {
    if (!filteredBills.length) return;
    const headers = [
      'bill_date',
      'household_id',
      'zone_id',
      'consumption_kwh',
      'solar_kwh',
      'rate_lkr_per_kwh',
      'bill_amount',
      'status',
      'billing_tier',
      'readings_count',
      'tariff_file',
    ];
    const rows = filteredBills.map((b) => [
      b.bill_date,
      b.household_id,
      b.zone_id,
      b.consumption_kwh,
      b.solar_kwh,
      b.rate_lkr_per_kwh,
      b.bill_lkr,
      b.status,
      b.billing_tier,
      b.readings_count,
      b.tariff_file,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartgrid-bills-${billsData?.bill_date || 'report'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="no-print">
        <PageHeader
          title="Billing & Tariffs"
          subtitle="Batch billing settlement, daily tariff reconciliation, and invoice generation."
          actions={
            <>
              <PillButton
                variant="secondary"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
                onClick={() => refetch()}
              >
                {isFetching ? 'Updating...' : 'Refresh'}
              </PillButton>
              <PillButton variant="secondary" icon={<FileDown className="w-4 h-4" />} onClick={exportBillsCsv}>
                Export CSV
              </PillButton>
              <PillButton variant="secondary" icon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
                Print Statement
              </PillButton>
            </>
          }
        />

        {/* Billing Overview KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <KpiCard
            featured
            title="Total Billed Revenue"
            value={`₹${(billsData?.total_bill_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            unit=""
            badge={{
              type: billsData?.is_final ? 'Final' : 'Estimate',
              tooltip: billsData?.is_final
                ? 'Airflow batch run computed authoritative bills.'
                : 'Speed layer daily estimate based on meter consumption.',
            }}
            subtext={billsData?.is_final ? 'Authoritative Batch Invoice' : 'Ongoing Period Estimate'}
          />

          <KpiCard
            title="Active Billing Period"
            value={billsData?.bill_date || 'No Date'}
            unit=""
            badge={{ type: 'Historical', tooltip: 'Simulated UTC Day' }}
            icon={<Calendar className="w-4 h-4 text-slate-600" />}
            statusType="info"
            statusText={billsData?.is_final ? 'Settled & Reconciled' : 'In Progress (Open Day)'}
          />

          <KpiCard
            title="Total Billable Energy"
            value={(billsData?.total_consumption_kwh || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
            unit="kWh"
            badge={{ type: 'Live', tooltip: 'Sum of valid de-duplicated consumption' }}
            icon={<Receipt className="w-4 h-4 text-emerald-600" />}
            statusType="ok"
            statusText="Meter telemetry validated"
          />

          <KpiCard
            title="Settlement Status"
            value={billsData?.is_final ? 'Final' : 'Estimate'}
            unit=""
            badge={{ type: billsData?.is_final ? 'Final' : 'Estimate', tooltip: 'Batch Pipeline State' }}
            icon={<Clock className="w-4 h-4 text-amber-500" />}
            statusType={billsData?.is_final ? 'ok' : 'warning'}
            statusText={billsData?.is_final ? 'Airflow DAG Completed' : 'Pending Midnight Tariff CSV'}
          />
        </div>

        {/* Filter and Search Bar Card */}
        <div className="rounded-3xl p-5 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] mt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search household (e.g. H001)..."
                value={searchHousehold}
                onChange={(e) => setSearchHousehold(e.target.value)}
                className="w-full bg-slate-50 rounded-full pl-10 pr-4 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 border border-slate-200/80 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Day Selector */}
              {billsData?.available_dates?.length ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Date:</span>
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="bg-slate-50 border border-slate-200/80 rounded-full px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="">Latest Billed Day</option>
                    {billsData.available_dates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Zone Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Zone:</span>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="bg-slate-50 border border-slate-200/80 rounded-full px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="">All Zones</option>
                  {zonesData?.zones.map((z) => (
                    <option key={z.zone_id} value={z.zone_id}>
                      Zone {z.zone_id}
                    </option>
                  ))}
                </select>
              </div>

              {(selectedDay || selectedZone || searchHousehold) && (
                <button
                  onClick={() => {
                    setSelectedDay('');
                    setSelectedZone('');
                    setSearchHousehold('');
                  }}
                  className="text-xs text-rose-600 font-semibold hover:underline px-2"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Household Bills Table */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Household Billing Settlement</h3>
              <p className="text-xs text-slate-400">
                Formula: Bill = Consumption (kWh) × Rate (₹/kWh). Rounded half-up to 2 dp.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {filteredBills.length} households shown
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-4 py-8">
              <CardSkeleton />
            </div>
          ) : isError ? (
            <ErrorState
              title="Could not load bills"
              message={(error as Error)?.message || 'Database error occurred.'}
              onRetry={() => refetch()}
            />
          ) : !filteredBills.length ? (
            <EmptyState
              title="No bills available"
              message="No bills found for the selected date or zone. When the simulated day ends, Airflow computes bills automatically."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Household</th>
                    <th className="py-3 px-3">Zone</th>
                    <th className="py-3 px-3 text-right">Consumption</th>
                    <th className="py-3 px-3 text-right">Solar (Gen)</th>
                    <th className="py-3 px-3 text-right">Tariff Rate</th>
                    <th className="py-3 px-3 text-right">Bill Amount</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium">
                  {filteredBills.map((b) => (
                    <tr key={`${b.bill_date}-${b.household_id}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-600">{b.bill_date}</td>
                      <td className="py-3 px-3 font-extrabold text-slate-900">{b.household_id}</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {b.zone_id}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800">
                        {Number(b.consumption_kwh).toFixed(2)} kWh
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-600 font-semibold">
                        {Number(b.solar_kwh).toFixed(2)} kWh
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        ₹{Number(b.rate_lkr_per_kwh).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-slate-900 text-sm">
                        ₹{Number(b.bill_lkr).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <StatusChip
                          status={b.status === 'Final' ? 'Final' : 'Estimate'}
                          label={b.status}
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setActiveModalBill(b)}
                          className="px-3 py-1 rounded-full text-xs font-semibold text-[#14532D] hover:bg-emerald-50 transition-colors"
                        >
                          View Invoice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bill Invoice Detail Modal */}
      {activeModalBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setActiveModalBill(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#14532D] text-white flex items-center justify-center font-bold">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Utility Bill Invoice</h3>
                <p className="text-xs text-slate-400">
                  Invoice ID: INV-{activeModalBill.household_id}-{activeModalBill.bill_date}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 mb-6 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Billing Date:</span>
                <span className="font-bold text-slate-800">{activeModalBill.bill_date} (UTC)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Household ID:</span>
                <span className="font-bold text-slate-800">{activeModalBill.household_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Zone:</span>
                <span className="font-bold text-slate-800">{activeModalBill.zone_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Billing Tier:</span>
                <span className="font-bold text-slate-800">{activeModalBill.billing_tier || 'Standard'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <StatusChip status={activeModalBill.status === 'Final' ? 'Final' : 'Estimate'} label={activeModalBill.status} />
              </div>
            </div>

            {/* Computation Breakdown */}
            <div className="border-t border-b border-slate-100 py-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total Consumption:</span>
                <span className="font-semibold">{Number(activeModalBill.consumption_kwh).toFixed(3)} kWh</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tariff Rate:</span>
                <span className="font-semibold">₹{Number(activeModalBill.rate_lkr_per_kwh).toFixed(4)} / kWh</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Solar Generation (Informational):</span>
                <span className="text-emerald-600 font-semibold">{Number(activeModalBill.solar_kwh).toFixed(3)} kWh</span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs italic">
                <span>* Solar credits / export feed-in:</span>
                <span>₹0.00 (No export tariff in MVP)</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t border-slate-100 font-extrabold text-slate-900 text-lg">
                <span>Total Amount Due:</span>
                <span className="text-2xl text-[#14532D]">₹{Number(activeModalBill.bill_lkr).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <PillButton variant="secondary" onClick={() => setActiveModalBill(null)}>
                Close
              </PillButton>
              <PillButton variant="primary" icon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
                Print Invoice
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* Printable Bill Summary (visible only when printing via window.print) */}
      <div className="hidden print:block p-8 bg-white text-slate-900">
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-3xl font-extrabold">EcoSync SmartGrid Energy Invoice Statement</h1>
          <p className="text-sm text-slate-500">Automated Daily Settlement & Tariff Reconciliation</p>
          <p className="text-xs text-slate-400 mt-1">Generated: {new Date().toUTCString()}</p>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-bold mb-2">Billing Period: {billsData?.bill_date || 'Current'}</h2>
          <p className="text-sm">Total Invoices: {filteredBills.length} | Total Settlement: ₹{billsData?.total_bill_amount.toFixed(2)}</p>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-400 font-bold">
              <th className="py-2">Household</th>
              <th className="py-2">Zone</th>
              <th className="py-2 text-right">Consumption (kWh)</th>
              <th className="py-2 text-right">Solar (kWh)</th>
              <th className="py-2 text-right">Rate (₹/kWh)</th>
              <th className="py-2 text-right">Total Bill (₹)</th>
              <th className="py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredBills.map((b) => (
              <tr key={`print-${b.bill_date}-${b.household_id}`} className="border-b border-slate-200">
                <td className="py-1.5 font-bold">{b.household_id}</td>
                <td className="py-1.5">{b.zone_id}</td>
                <td className="py-1.5 text-right">{Number(b.consumption_kwh).toFixed(2)}</td>
                <td className="py-1.5 text-right">{Number(b.solar_kwh).toFixed(2)}</td>
                <td className="py-1.5 text-right">₹{Number(b.rate_lkr_per_kwh).toFixed(2)}</td>
                <td className="py-1.5 text-right font-bold">₹{Number(b.bill_lkr).toFixed(2)}</td>
                <td className="py-1.5 text-center">{b.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 text-xs text-slate-500 border-t pt-4">
          <p>Rule: bill_lkr = daily_consumption_kwh × rate_lkr_per_kwh (rounded half-up to 2 dp).</p>
          <p>Airflow batch reconciliation verifies readings completeness before finalizing invoices.</p>
        </div>
      </div>
    </div>
  );
};
