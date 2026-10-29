import React from 'react';
import { MoreHorizontal } from 'lucide-react';

interface DonutProgressProps {
  title?: string;
  percentage: number;
  label?: string;
  items?: Array<{
    label: string;
    value: string;
    color: string;
  }>;
  className?: string;
}

export const DonutProgress: React.FC<DonutProgressProps> = ({
  title = 'Savings Progress',
  percentage,
  label = 'GOAL REACHED',
  items = [],
  className = '',
}) => {
  const clamped = Math.min(100, Math.max(0, percentage));
  const strokeWidth = 14;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`rounded-3xl p-6 bg-white border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
        <button className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex items-center justify-center my-4">
        <svg className="w-48 h-48 -rotate-90 transform" viewBox="0 0 160 160">
          {/* Background circle track */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
          />
          {/* Active progress arc */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="#14532D"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Centered percentage and label */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{clamped}%</span>
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mt-0.5">{label}</span>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2.5 mt-2 border-t border-slate-100 pt-4">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-slate-600 font-medium">{item.label}</span>
              </div>
              <span className="font-bold text-slate-900">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
