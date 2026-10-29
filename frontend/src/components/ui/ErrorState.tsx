import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { PillButton } from './PillButton';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load telemetry data',
  message = 'Could not establish connection to the FastAPI backend service. Ensure the database and API containers are running.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`rounded-3xl p-8 bg-white border border-rose-100 shadow-sm flex flex-col items-center justify-center text-center ${className}`}
    >
      <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md mb-6">{message}</p>
      {onRetry && (
        <PillButton variant="primary" icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
          Retry Connection
        </PillButton>
      )}
    </div>
  );
};
