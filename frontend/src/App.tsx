import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/layout/AppLayout';
import { OverviewPage } from './pages/OverviewPage';
import { EnergyMonitoringPage } from './pages/EnergyMonitoringPage';
import { SolarPage } from './pages/SolarPage';
import { BillingPage } from './pages/BillingPage';
import { HouseholdsPage } from './pages/HouseholdsPage';
import { HealthPage } from './pages/HealthPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 2000,
    },
  },
});

export const App: React.FC = () => {
  // Use HashRouter so that serving from FastAPI static directory works seamlessly on any subpath or direct refresh without server URL rewrite rules
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="monitoring" element={<EnergyMonitoringPage />} />
            <Route path="solar" element={<SolarPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="households" element={<HouseholdsPage />} />
            <Route path="health" element={<HealthPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
};

export default App;
