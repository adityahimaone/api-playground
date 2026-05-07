'use client';

import Sidebar from '@/components/sidebar';
import RequestBuilder from '@/components/request-builder';
import ResponseViewer from '@/components/response-viewer';
import VariablesModal from '@/components/variables-modal';
import SaveToCollectionModal from '@/components/save-modal';
import { usePlaygroundStore } from '@/lib/store';
import { useState, useEffect, useCallback } from 'react';
import { METHOD_COLORS, HttpMethod } from '@/lib/types';

export default function Home() {
  const {
    response, loading, workspaces, activeWorkspaceId, setActiveWorkspaceId,
    environments, activeEnvId, setActiveEnvId,
    activeRequest, tabs, activeTabId, setActiveTab, closeTab, sendRequest,
  } = usePlaygroundStore();
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [colorTheme, setColorTheme] = useState<'light' | 'dark'>('light');
  const [authEnabled, setAuthEnabled] = useState(false);

  // ═══ Keyboard shortcuts ═══
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl/Cmd + Enter → Send request
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!loading && activeRequest.url.trim()) sendRequest();
    }
    // Ctrl/Cmd + S → Save to collection
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      setShowSaveModal(true);
    }
    // Ctrl/Cmd + W → Close active tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
    }
  }, [loading, activeRequest.url, sendRequest, activeTabId, closeTab]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Theme + workspace init
  useEffect(() => {
    const saved = localStorage.getItem('api-theme') as 'light' | 'dark' | null;
    if (saved) { setColorTheme(saved); document.documentElement.setAttribute('data-theme', saved); }
    const savedAuth = localStorage.getItem('api-feature-auth');
    setAuthEnabled(savedAuth === 'true');
    if (!activeWorkspaceId && workspaces.length > 0) setActiveWorkspaceId(workspaces[0].id);
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

  const savedResponsesCount = activeRequest.savedResponses?.length || 0;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-page)' }}>
      {/* ═══ TOPBAR ═══ */}
      <nav className="flex items-center justify-between px-4 h-11 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--accent-primary)', color: '#000' }}>AP</div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>API Playground</span>
          {activeWorkspaceId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>
              {workspaces.find(w => w.id === activeWorkspaceId)?.name || ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <select value={activeEnvId || ''} onChange={e => setActiveEnvId(e.target.value || null)}
            className="input text-[11px]"
            style={{ padding: '4px 8px', minWidth: '120px', cursor: 'pointer', background: activeEnvId ? 'var(--accent-primary-soft)' : 'var(--bg-hover)', border: activeEnvId ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)' }}>
            <option value="">No Environment</option>
            {environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
          </select>
          {savedResponsesCount > 0 && (
            <span className="text-[10px] px-2 py-1 rounded-full font-medium" style={{ background: 'var(--info)', color: '#fff' }}>
              {savedResponsesCount} saved
            </span>
          )}
          <button onClick={() => setShowVarsModal(true)} className="btn-ghost text-[11px] py-1 px-2.5">Variables</button>
          <button onClick={() => setShowSaveModal(true)} className="btn-ghost text-[11px] py-1 px-2.5">Save</button>
          <button onClick={toggleTheme} className="btn-icon" title="Toggle theme" style={{ width: '28px', height: '28px' }}>{colorTheme === 'dark' ? '☀️' : '🌙'}</button>
          <button onClick={() => setShowSettings(!showSettings)} className="btn-icon" title="Settings" style={{ width: '28px', height: '28px' }}>⚙</button>
        </div>
      </nav>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="absolute right-4 top-12 z-50 rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-modal)', minWidth: '240px' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Features</div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Account / Auth</span>
            <button onClick={toggleAuth} className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ background: authEnabled ? 'var(--accent-primary)' : 'var(--border-default)' }}>
              <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                style={{ transform: authEnabled ? 'translateX(18px)' : 'translateX(3px)' }} />
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Enable Google OAuth login (requires Supabase + Google Cloud setup)</p>
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Keyboard Shortcuts</div>
          <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex justify-between"><span>Send Request</span><kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-hover)', fontFamily: 'var(--font-mono)' }}>Ctrl+Enter</kbd></div>
            <div className="flex justify-between"><span>Save Request</span><kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-hover)', fontFamily: 'var(--font-mono)' }}>Ctrl+S</kbd></div>
            <div className="flex justify-between"><span>Close Tab</span><kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-hover)', fontFamily: 'var(--font-mono)' }}>Ctrl+W</kbd></div>
          </div>
        </div>
      )}

      {/* ═══ TABS BAR ═══ */}
      {tabs.length > 0 && (
        <div className="flex items-center shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)', minHeight: '34px' }}>
          {tabs.map(tab => (
            <div key={tab.id}
              className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r shrink-0"
              style={{
                background: tab.id === activeTabId ? 'var(--bg-card)' : 'transparent',
                borderBottom: tab.id === activeTabId ? '2px solid var(--accent-primary)' : '2px solid transparent',
                borderColor: 'var(--border-subtle)',
              }}
              onClick={() => setActiveTab(tab.id)}>
              <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                style={{ background: METHOD_COLORS[tab.request.method as HttpMethod] + '22', color: METHOD_COLORS[tab.request.method as HttpMethod] }}>
                {tab.request.method}
              </span>
              <span className="text-[11px] truncate max-w-[120px]"
                style={{ color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {tab.name}
              </span>
              {tab.hasChanges && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />}
              <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="btn-icon ml-0.5" style={{ width: '16px', height: '16px', fontSize: '9px', color: 'var(--text-faint)' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ MAIN LAYOUT ═══ */}
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
        <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Use {'{{variable}}'} for dynamic values · Ctrl+Enter to send</p>
      </div>
    </div>
  );
}
