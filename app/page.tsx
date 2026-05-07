'use client';

import Sidebar from '@/components/sidebar';
import RequestBuilder from '@/components/request-builder';
import ResponseViewer from '@/components/response-viewer';
import VariablesModal from '@/components/variables-modal';
import SaveToCollectionModal from '@/components/save-modal';
import { usePlaygroundStore } from '@/lib/store';
import { useState, useEffect } from 'react';

export default function Home() {
  const { response, loading, workspaces, activeWorkspaceId, setActiveWorkspaceId } = usePlaygroundStore();
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [colorTheme, setColorTheme] = useState<'light' | 'dark'>('light');
  const [authEnabled, setAuthEnabled] = useState(false);

  // Load theme + init workspace from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('api-theme') as 'light' | 'dark' | null;
    if (saved) {
      setColorTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
    const savedAuth = localStorage.getItem('api-feature-auth');
    setAuthEnabled(savedAuth === 'true');

    // Auto-select first workspace if none selected
    if (!activeWorkspaceId && workspaces.length > 0) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, []);

  const toggleTheme = () => {
    const next = colorTheme === 'dark' ? 'light' : 'dark';
    setColorTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('api-theme', next);
  };

  const toggleAuth = () => {
    const next = !authEnabled;
    setAuthEnabled(next);
    localStorage.setItem('api-feature-auth', String(next));
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-page)' }}>
      {/* Top bar */}
      <nav
        className="flex items-center justify-between px-4 h-11 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--accent-primary)', color: '#000' }}
          >
            AP
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>API Playground</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowVarsModal(true)} className="btn-ghost text-[11px] py-1 px-2.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18m-6-6l6 6 6-6"/></svg>
            Variables
          </button>
          <button onClick={() => setShowSaveModal(true)} className="btn-ghost text-[11px] py-1 px-2.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save
          </button>
          <button onClick={toggleTheme} className="btn-icon" title="Toggle theme" style={{ width: '28px', height: '28px' }}>
            {colorTheme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="btn-icon" title="Settings" style={{ width: '28px', height: '28px' }}>
            ⚙
          </button>
        </div>
      </nav>

      {/* Settings dropdown */}
      {showSettings && (
        <div
          className="absolute right-4 top-12 z-50 rounded-xl p-4 space-y-3"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-modal)',
            minWidth: '240px',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
            Features
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Account / Auth</span>
            <button
              onClick={toggleAuth}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{
                background: authEnabled ? 'var(--accent-primary)' : 'var(--border-default)',
              }}
            >
              <span
                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                style={{ transform: authEnabled ? 'translateX(18px)' : 'translateX(3px)' }}
              />
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Enable Google OAuth login (requires Supabase + Google Cloud setup)
          </p>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <RequestBuilder />
          {response || loading ? <ResponseViewer /> : <EmptyState />}
        </div>
      </div>

      {showVarsModal && <VariablesModal onClose={() => setShowVarsModal(false)} />}
      {showSaveModal && <SaveToCollectionModal onClose={() => setShowSaveModal(false)} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-faint)' }}>
      <div className="text-center">
        <div className="text-4xl mb-3">🚀</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Enter a URL and hit Send</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Use {'{{variable}}'} syntax for dynamic values</p>
      </div>
    </div>
  );
}
