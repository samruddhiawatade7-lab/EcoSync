import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  featured?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', featured = false, ...props }) => {
  return (
    <div
      className={`rounded-3xl p-6 transition-all duration-200 ${
        featured
          ? 'bg-[#14532D] text-white shadow-lg shadow-emerald-950/10'
          : 'bg-white text-slate-900 border border-slate-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
