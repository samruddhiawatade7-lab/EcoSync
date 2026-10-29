import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Background health check polling to keep alert count badge live
  const { data: healthData } = useQuery({
    queryKey: ['health-pill'],
    queryFn: () => api.getHealth(),
    refetchInterval: 15000,
    retry: 1,
  });

  const activeAlerts = healthData?.alerts?.length || 0;

  return (
    <div className="min-h-screen bg-[#EBECEC] flex flex-col lg:flex-row antialiased">
      {/* Floating Left Sidebar */}
      <Sidebar isOpenMobile={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 p-4 sm:p-6 lg:p-8">
        <Header onToggleMobileMenu={() => setMobileMenuOpen(true)} activeAlertsCount={activeAlerts} />

        <main className="flex-1 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
