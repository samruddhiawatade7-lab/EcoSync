import React from 'react';
import { Search, Moon, Bell, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  activeAlertsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu, activeAlertsCount = 0 }) => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between gap-4 mb-8">
      {/* Mobile Hamburger + Search Input */}
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2.5 rounded-full bg-white text-slate-700 shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search devices or metrics..."
            className="w-full bg-white rounded-full pl-11 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 border border-slate-100/90 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D] transition-all"
          />
        </div>
      </div>

      {/* Right Action Icons & User Avatar */}
      <div className="flex items-center gap-3">
        {/* Theme button */}
        <button
          title="Toggle mode"
          className="w-10 h-10 rounded-full bg-white text-slate-600 shadow-sm border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          <Moon className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <button
          onClick={() => navigate('/health')}
          title="Alerts and notifications"
          className="relative w-10 h-10 rounded-full bg-white text-slate-600 shadow-sm border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          <Bell className="w-4 h-4" />
          {activeAlertsCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>

        {/* User Block */}
        <div className="flex items-center gap-3 pl-2">
          <div className="hidden sm:block text-right">
            <div className="text-sm font-bold text-slate-900 leading-tight">Julian Rivera</div>
            <div className="text-[11px] text-slate-400 font-medium">Grid Operator</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shadow-sm text-sm border-2 border-white ring-1 ring-slate-100">
            JR
          </div>
        </div>
      </div>
    </header>
  );
};
