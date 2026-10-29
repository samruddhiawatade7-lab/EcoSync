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
  ShieldAlert,
  ShieldCheck,
  Database,
  Cpu,
  Server,
  Radio,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Layers,
  Inbox,
} from 'lucide-react';

export const HealthPage: React.FC = () => {
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<string[]>([]);

  // Real pipeline health check from /health
  const {
    data: healthData,
    isLoading: isHealthLoading,
    isError: isHealthError,
    error: healthError,
    refetch: refetchHealth,
    isFetching,
  } = useQuery({
    queryKey: ['health-full'],
    queryFn: () => api.getHealth(),
    refetchInterval: 5000,
  });

  // Fetch detailed alerts and DLQ from /api/alerts
  const { data: alertsData, refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts-full'],
    queryFn: () => api.getAlerts(),
    refetchInterval: 5000,
  });

  const handleAcknowledge = async (alertName: string) => {
    try {
      await api.acknowledgeAlert(alertName);
      setAcknowledgedAlerts((prev) => [...prev, alertName]);
    } catch {
      // ignore
    }
  };

  const handleRefreshAll = () => {
    refetchHealth();
    refetchAlerts();
  };

  if (isHealthLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alerts & System Health" subtitle="Real-time pipeline health check, Dead-Letter Queue inspector, and SLA monitoring." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (isHealthError || !healthData) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alerts & System Health" subtitle="Real-time pipeline health check, Dead-Letter Queue inspector, and SLA monitoring." />
        <ErrorState
          title="Health Probe Service Offline"
          message={(healthError as Error)?.message || 'FastAPI health endpoint is unreachable.'}
          onRetry={handleRefreshAll}
        />
      </div>
    );
  }

  const { services, metrics_summary, last_billing_run } = healthData;
  const activeAlerts = (healthData.alerts || []).filter((a) => !acknowledgedAlerts.includes(a.name));
  const thresholds = alertsData?.thresholds;
  const dlqRecords = alertsData?.recent_dead_letters || [];
  const recentBatches = alertsData?.recent_batches || [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Alerts & System Health"
        subtitle="Real-time pipeline health check, Dead-Letter Queue inspector, and SLA monitoring."
        actions={
          <PillButton
            variant="secondary"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            onClick={handleRefreshAll}
          >
            {isFetching ? 'Probing...' : 'Re-probe Health'}
          </PillButton>
        }
      />

      {/* Services Health Grid (Real status checks) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* PostgreSQL */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">PostgreSQL</span>
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {services.postgres.status === 'up' ? 'Connected' : 'Offline'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Ping latency: <span className="font-bold text-slate-700">{services.postgres.latency_ms} ms</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <StatusChip status={services.postgres.status === 'up' ? 'online' : 'offline'} />
            <span className="text-[11px] font-mono text-slate-400">Port 5432</span>
          </div>
        </div>

        {/* Kafka Broker */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Kafka Broker</span>
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {services.kafka.status === 'up' ? 'Broadcasting' : 'Degraded'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Topic: <span className="font-bold text-slate-700 font-mono">meter-readings</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <StatusChip status={services.kafka.status === 'up' ? 'online' : 'warning'} />
            <span className="text-[11px] font-mono text-slate-400">3 Partitions</span>
          </div>
        </div>

        {/* Spark Streaming */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Spark Streaming</span>
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {services.spark.status === 'up' ? 'Processing' : 'Stale'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Micro-batch: <span className="font-bold text-slate-700">{services.spark.age_seconds !== undefined ? `${services.spark.age_seconds}s ago` : 'Active'}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <StatusChip status={services.spark.status === 'up' ? 'online' : 'warning'} />
            <span className="text-[11px] font-mono text-slate-400">Speed Layer</span>
          </div>
        </div>

        {/* FastAPI Engine */}
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">FastAPI Service</span>
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">Healthy</div>
            <div className="text-xs text-slate-400 mt-1">
              Uptime: <span className="font-bold text-slate-700">{Math.round(healthData.uptime_seconds)}s</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <StatusChip status="online" label="Serving" />
            <span className="text-[11px] font-mono text-slate-400">Port 8000</span>
          </div>
        </div>
      </div>

      {/* Active Alerts Panel */}
      <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-900 text-lg">Active System Alerts</h3>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            {activeAlerts.length} triggered
          </span>
        </div>

        {activeAlerts.length === 0 ? (
          <div className="p-6 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3 text-emerald-800">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">All Grid Pipelines Operating Optimally</div>
              <div className="text-xs text-emerald-700/90 mt-0.5">
                No stale meters, no high error rates, and no billing pipeline failures detected.
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((a, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                  a.severity === 'critical'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle
                    className={`w-5 h-5 flex-shrink-0 ${
                      a.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  />
                  <div>
                    <span className="font-bold text-xs uppercase tracking-wider block font-mono">
                      {a.name} · {a.severity}
                    </span>
                    <span className="text-sm">{a.message}</span>
                  </div>
                </div>

                <PillButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAcknowledge(a.name)}
                >
                  Acknowledge
                </PillButton>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thresholds & Observability Config */}
      {thresholds && (
        <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-5 h-5 text-[#14532D]" />
            <h3 className="font-bold text-slate-900 text-base">Configured Operational Thresholds</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block font-medium">Stale Data Threshold</span>
              <span className="text-base font-extrabold text-slate-800">
                {thresholds.stale_after_seconds} seconds
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Triggers critical alert if no reading ingested</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block font-medium">Max Invalid Rate Threshold</span>
              <span className="text-base font-extrabold text-slate-800">
                {thresholds.invalid_rate_threshold_pct}%
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Triggers warning if DLQ rate exceeds in 5m</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block font-medium">Low Renewable Warning Threshold</span>
              <span className="text-base font-extrabold text-slate-800">
                {thresholds.low_renewable_threshold_pct}%
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Evaluated during 10:00–14:00 solar windows</p>
            </div>
          </div>
        </div>
      )}

      {/* Dead-Letter Queue (DLQ) Inspector */}
      <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Dead-Letter Queue (DLQ) Inspector</h3>
            <p className="text-xs text-slate-400">
              Readings rejected by Spark Structured Streaming validation and committed to table `invalid_readings`
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {metrics_summary?.invalid_total || 0} total rejected
          </span>
        </div>

        {dlqRecords.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-50 text-center text-xs text-slate-400">
            No rejected readings recorded in dead-letter table.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Ingested At</th>
                  <th className="py-2.5 px-3">Kafka Coord</th>
                  <th className="py-2.5 px-3">Error Reason</th>
                  <th className="py-2.5 px-3">Raw Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dlqRecords.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {new Date(r.ingested_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {r.kafka_topic}:P{r.kafka_partition}:#{r.kafka_offset}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-rose-600">{r.error_reason}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 truncate max-w-xs">
                      {r.raw_value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Spark Micro-Batch Performance Table */}
      <div className="rounded-3xl p-6 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]">
        <h3 className="font-bold text-slate-900 text-base mb-1">Spark Micro-Batch Performance (Speed Layer)</h3>
        <p className="text-xs text-slate-400 mb-4">
          Throughput and deduplication audit log from table `stream_batches`
        </p>

        {recentBatches.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-50 text-center text-xs text-slate-400">
            Waiting for Spark micro-batches to record execution metrics...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Query Sink</th>
                  <th className="py-2.5 px-3">Batch ID</th>
                  <th className="py-2.5 px-3 text-right">Input Rows</th>
                  <th className="py-2.5 px-3 text-right">Valid Rows</th>
                  <th className="py-2.5 px-3 text-right">Duplicates Skipped</th>
                  <th className="py-2.5 px-3 text-right">Invalid Rows</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3">Processed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentBatches.map((b: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono text-slate-700 font-semibold">{b.query_name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">#{b.batch_id}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">{b.input_rows}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">{b.valid_rows}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-700">{b.duplicate_rows}</td>
                    <td className="py-2.5 px-3 text-right text-rose-600 font-semibold">{b.invalid_rows}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">{b.duration_ms} ms</td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(b.processed_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
