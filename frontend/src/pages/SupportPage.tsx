import React from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { HelpCircle, BookOpen, Layers, ShieldCheck } from 'lucide-react';

export const SupportPage: React.FC = () => {
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Support & Lambda Architecture Docs"
        subtitle="Operational guide and pipeline architecture reference."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Lambda Architecture Design</h3>
              <p className="text-xs text-slate-400">EC8203 Applied Big Data Engineering</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <p>
              <strong>Speed Layer (Kafka + Spark):</strong> Consumes raw readings from topic{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">meter-readings</code>. Spark Structured
              Streaming performs micro-batch validation, splits dead-letter invalid readings into{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">invalid_readings</code>, and deduplicates
              valid readings on <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">event_id</code> into{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">meter_readings</code>.
            </p>
            <p>
              <strong>Batch Layer (Airflow):</strong> Runs daily when midnight tariff CSVs land in{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">/data/incoming/</code>. Reconciles daily
              consumption from master readings and computes authoritative invoices in{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">household_bills</code>.
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Quick Operator Commands</h3>
              <p className="text-xs text-slate-400">Terminal operations</p>
            </div>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-700">
            <div className="p-2.5 rounded-xl bg-slate-50">
              docker compose up -d --build
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50">
              curl -s localhost:8000/health | python3 -m json.tool
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50">
              docker compose exec postgres psql -U smartgrid -d smartgrid
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
