import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Sun,
  Receipt,
  Users,
  ShieldAlert,
  Settings,
  HelpCircle,
  Leaf,
  X,
} from 'lucide-react';

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile = false, onCloseMobile }) => {
  const navItems = [
    { label: 'Energy Overview', path: '/', icon: LayoutDashboard },
    { label: 'Energy Monitoring', path: '/monitoring', icon: Activity },
    { label: 'Solar & Renewables', path: '/solar', icon: Sun },
    { label: 'Billing & Tariffs', path: '/billing', icon: Receipt },
    { label: 'Households & Zones', path: '/households', icon: Users },
    { label: 'Alerts & Health', path: '/health', icon: ShieldAlert },
  ];

  const accountItems = [
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Support & Docs', path: '/support', icon: HelpCircle },
  ];

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between p-6">
      <div>
        {/* Brand Logo */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#14532D] text-white flex items-center justify-center shadow-sm">
              <Leaf className="w-5 h-5 fill-white text-white" />
            </div>
            <div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">EcoSync</span>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">SmartGrid</span>
            </div>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* MENU Group */}
        <div className="space-y-6">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-4 mb-2.5">MENU</div>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-full text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-[#E8EFEA] text-[#14532D]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#14532D]' : 'text-slate-500'}`}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* ACCOUNT Group */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-4 mb-2.5">ACCOUNT</div>
            <nav className="space-y-1">
              {accountItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-full text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-[#E8EFEA] text-[#14532D]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#14532D]' : 'text-slate-500'}`}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Grid Status Pill Footer */}
      <div className="pt-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700">Grid Engine</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">v2.0 (UTC)</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Floating White Sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-white rounded-4xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04)] border border-slate-100/80 my-2 ml-2 self-stretch sticky top-6 max-h-[calc(100vh-3rem)]">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-10 flex flex-col">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
