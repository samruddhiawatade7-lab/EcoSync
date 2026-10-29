import React from 'react';
import { ArrowUpRight, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { DataBadgeType } from '../../types';

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  featured?: boolean;
  badge?: {
    type: DataBadgeType;
    tooltip?: string;
  };
  statusText?: string;
  statusType?: 'ok' | 'warning' | 'info' | 'default';
  icon?: React.ReactNode;
  subtext?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  featured = false,
  badge,
  statusText,
  statusType = 'ok',
  icon,
  subtext,
  onClick,
}) => {
  if (featured) {
    return (
      <div
        onClick={onClick}
        className={`rounded-3xl p-6 bg-[#14532D] text-white shadow-md shadow-emerald-950/15 relative overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5 ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm font-medium tracking-wide">{title}</span>
            {badge && (
              <span
                title={badge.tooltip}
                className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-white/20 text-white cursor-help"
              >
                {badge.type}
              </span>
            )}
          </div>
          <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white backdrop-blur-sm">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="my-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold tracking-tight">{value}</span>
            {unit && <span className="text-white/80 font-medium text-base">{unit}</span>}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-white/90 font-medium">
          {subtext ? (
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-300 font-semibold">↗</span>
              <span>{subtext}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-time Telemetry</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-3xl p-6 bg-white text-slate-900 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm font-medium tracking-wide">{title}</span>
          {badge && (
            <span
              title={badge.tooltip}
              className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full cursor-help ${
                badge.type === 'Live'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : badge.type === 'Estimate'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                  : 'bg-slate-100 text-slate-700 border border-slate-200/60'
              }`}
            >
              {badge.type}
            </span>
          )}
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-100/70 flex items-center justify-center text-slate-600">
          {icon || <Info className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      <div className="my-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">{value}</span>
          {unit && <span className="text-slate-500 font-medium text-sm lg:text-base">{unit}</span>}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
        {statusType === 'warning' && (
          <span className="text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {statusText || 'Peak usage detected'}
          </span>
        )}
        {statusType === 'ok' && (
          <span className="text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            {statusText || 'Optimal generation'}
          </span>
        )}
        {statusType === 'info' && (
          <span className="text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            {statusText || subtext}
          </span>
        )}
      </div>
    </div>
  );
};
