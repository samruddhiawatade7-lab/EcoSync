import React from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Settings, Sliders, Bell, Database, Globe } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Settings & System Config"
        subtitle="Operational parameters, alert thresholds, and cluster connectivity options."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Alert & Telemetry Rules</h3>
              <p className="text-xs text-slate-400">Configured via environment variables in docker-compose</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Stale Data Threshold:</span>
              <span className="font-mono font-bold text-slate-800">30 seconds</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Invalid Reading Threshold:</span>
              <span className="font-mono font-bold text-slate-800">5.0%</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Low Renewable Quota:</span>
              <span className="font-mono font-bold text-slate-800">10.0%</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Telemetry Speedup Rate:</span>
              <span className="font-mono font-bold text-slate-800">288× (1 sim day = 300s)</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Backend Endpoints</h3>
              <p className="text-xs text-slate-400">Serving layer routes</p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-slate-700">
              FastAPI: http://localhost:8000
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-slate-700">
              Swagger Docs: http://localhost:8000/docs
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-slate-700">
              Prometheus Metrics: http://localhost:8000/metrics
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-slate-700">
              Streamlit Backup: http://localhost:8501
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
