import React from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, refreshAll, useApi, type AgentStatus } from './api';
import {
  IconBriefcase, IconChart, IconCog, IconDoc, IconHome, IconPause, IconPlay, IconPulse, IconRefresh, IconSend, IconUser,
} from './icons';
import { Badge, Button, cls } from './ui';
import { ActivityPage } from './pages/Activity';
import { AnalyticsPage } from './pages/Analytics';
import { ApplicationsPage } from './pages/Applications';
import { DashboardPage } from './pages/Dashboard';
import { DocumentsPage } from './pages/Documents';
import { JobsPage } from './pages/Jobs';
import { ProfilePage } from './pages/Profile';
import { SettingsPage } from './pages/Settings';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconHome },
  { to: '/jobs', label: 'Jobs', icon: IconBriefcase },
  { to: '/applications', label: 'Applications', icon: IconSend },
  { to: '/analytics', label: 'Analytics', icon: IconChart },
  { to: '/documents', label: 'Documents', icon: IconDoc },
  { to: '/activity', label: 'Activity', icon: IconPulse },
  { to: '/profile', label: 'Profile', icon: IconUser },
  { to: '/settings', label: 'Settings', icon: IconCog },
];

function AgentBar() {
  const { data: status } = useApi<AgentStatus>('/agent/status', { refreshMs: 10_000 });
  const toggle = async (): Promise<void> => {
    await api(status?.paused ? '/agent/resume' : '/agent/pause', { method: 'POST' });
    refreshAll();
  };
  const runNow = async (): Promise<void> => {
    try {
      await api('/agent/run', { method: 'POST', json: {} });
    } catch {
      /* busy/paused — status text explains */
    }
    refreshAll();
  };
  return (
    <div className="flex items-center gap-3">
      {status && !status.llmConfigured && (
        <Badge tone="amber" className="hidden md:inline-flex">no API key — analysis off</Badge>
      )}
      {status && (
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className={cls(
              'h-2 w-2 rounded-full',
              status.paused ? 'bg-amber-500' : status.running ? 'animate-pulse bg-emerald-500' : 'bg-emerald-400',
            )}
          />
          {status.paused ? 'Agent paused' : status.running ? 'Agent working…' : 'Agent idle'}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={runNow} title="Run a full cycle now" disabled={status?.running || status?.paused}>
        <IconRefresh className="h-3.5 w-3.5" /> Run now
      </Button>
      <Button size="sm" variant={status?.paused ? 'primary' : 'subtle'} onClick={toggle}>
        {status?.paused ? (
          <>
            <IconPlay className="h-3.5 w-3.5" /> Resume
          </>
        ) : (
          <>
            <IconPause className="h-3.5 w-3.5" /> Pause
          </>
        )}
      </Button>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-52 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">JH</div>
          <div>
            <div className="text-sm leading-4 font-bold text-slate-900">Job Hunter</div>
            <div className="text-[10px] text-slate-400">autonomous agent</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: I }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cls(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <I className="h-4.5 w-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-[10px] text-slate-300">AI Job Hunter · MVP</div>
      </aside>
      <div className="ml-52 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-end border-b border-slate-200 bg-white/80 px-6 py-2.5 backdrop-blur">
          <AgentBar />
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
