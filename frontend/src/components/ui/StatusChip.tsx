import React from 'react';

interface StatusChipProps {
  status: 'online' | 'degraded' | 'offline' | 'ok' | 'warning' | 'critical' | 'healthy' | 'Estimate' | 'Final';
  label?: string;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, label, className = '' }) => {
  const norm = status.toLowerCase();

  let bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotClass = 'bg-slate-400';

  if (norm === 'online' || norm === 'ok' || norm === 'healthy' || norm === 'final') {
    bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/70';
    dotClass = 'bg-emerald-500';
  } else if (norm === 'degraded' || norm === 'warning' || norm === 'estimate') {
    bgClass = 'bg-amber-50 text-amber-800 border-amber-200/70';
    dotClass = 'bg-amber-500';
  } else if (norm === 'offline' || norm === 'critical') {
    bgClass = 'bg-rose-50 text-rose-800 border-rose-200/70';
    dotClass = 'bg-rose-500';
  }

  const displayLabel = label || status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${bgClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      <span className="capitalize">{displayLabel}</span>
    </span>
  );
};
