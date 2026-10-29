import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-slate-200/80 rounded-2xl ${className}`} />;
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="rounded-3xl p-6 bg-white border border-slate-100/80 shadow-sm animate-pulse space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-10 w-36" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
};
