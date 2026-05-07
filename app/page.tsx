'use client';

import Sidebar from '@/components/sidebar';
import RequestBuilder from '@/components/request-builder';
import ResponseViewer from '@/components/response-viewer';
import VariablesModal from '@/components/variables-modal';
import SaveToCollectionModal from '@/components/save-modal';

import { useCollectionStore } from '@/lib/stores';
import { useRequestStore } from '@/lib/stores';
import { useUIStore } from '@/lib/stores';
import { useHistoryStore } from '@/lib/stores';

import { METHOD_COLORS, HttpMethod } from '@/lib/entities';
import { nodeRepository } from '@/lib/repositories/node.repository';
import { requestRepository } from '@/lib/repositories/request.repository';
import { responseRepository } from '@/lib/repositories/response.repository';
import { historyRepository } from '@/lib/repositories/history.repository';

import { useState, useEffect, useCallback } from 'react';

export default function Home() {
  const {
    tabs, activeTabId, setActiveTab, closeTab,
    theme, setTheme, response, loading,
  } = useUIStore();
  const { treeNodes } = useCollectionStore();
  const { getRequest } = useRequestStore();

  const [showVarsModal, setShowVarsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ═══ Load data from Dexie on mount ═══
  useEffect(() => {
    async function loadData() {
      try {
        // Load tree nodes
        const nodes = await nodeRepository.getAll();
        if (nodes.length > 0) {
          useCollectionStore.getState().loadTree(nodes);
        }

        // Load requests
        const reqs = await requestRepository.getAll();
        if (reqs.length > 0) {
          useRequestStore.getState().loadRequests(reqs);
        }

        // Load responses
        const resps = await responseRepository.getAll();
        if (resps.length > 0) {
          useRequestStore.getState().loadResponses(resps);
        }
      } catch (err) {
        console.error('Failed to load data from Dexie:', err);
      }
    }
    loadData();
  }, []);

  // ═══ Theme init ═══
  useEffect(() => {
    const saved = localStorage.getItem('api-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('api-theme', next);
  };

  // ═══ Keyboard shortcuts ═══
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl/Cmd + Enter → Send request
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      // Trigger send via RequestBuilder's send handler
      // We dispatch a custom event
      document.dispatchEvent(new CustomEvent('api-playground:send'));
    }
    // Ctrl/Cmd + S → Save draft
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (activeTabId) {
        useUIStore.getState().saveDraft(activeTabId);
      }
    }
    // Ctrl/Cmd + W → Close active tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
    }
  }, [activeTabId, closeTab]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-page)' }}>
      {/* ═══ TOPBAR ═══ */}
      <nav
        className="flex items-center justify-between px-4 h-11 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--accent-primary)', color: '#000' }}
          >
            AP
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            API Playground
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>
            Normalized Architecture
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowVarsModal(true)}
            className="btn-ghost text-[11px] py-1 px-2.5"
          >
            Variables
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="btn-ghost text-[11px] py-1 px-2.5"
          >
            Save
          </button>
          <button
            onClick={toggleTheme}
            className="btn-icon"
            title="Toggle theme"
            style={{ width: '28px', height: '28px' }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-icon"
            title="Settings"
            style={{ width: '28px', height: '28px' }}
          >
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
            Keyboard Shortcuts
          </div>
          <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex justify-between">
              <span>Send Request</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-hover)', fontFamily: 'var(--font-mono)' }}>Ctrl+Enter</kbd>
            </div>
            <div className="flex justify-between">
              <span>Save Draft</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-hover)', fontFamily: 'var(--font-mono)' }}>Ctrl+S</kbd>
            </div>
            <div className="flex justify-between">
              <span>Close Tab</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-hover)', fontFamily: 'var(--font-mono)' }}>Ctrl+W</kbd>
            </div>
          </div>
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
            Architecture
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Normalized tree: flat treeNodes + separate request entities. Data persisted via Dexie (IndexedDB).
          </p>
        </div>
      )}

      {/* ═══ TABS BAR ═══ */}
      {tabs.length > 0 && (
        <div
          className="flex items-center shrink-0 overflow-x-auto"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-sidebar)',
            minHeight: '34px',
          }}
        >
          {tabs.map((tab) => {
            const req = getRequest(tab.requestId);
            return (
              <div
                key={tab.id}
                className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r shrink-0"
                style={{
                  background: tab.id === activeTabId ? 'var(--bg-card)' : 'transparent',
                  borderBottom: tab.id === activeTabId ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  borderColor: 'var(--border-subtle)',
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                <span
                  className="text-[9px] font-bold px-1 py-0.5 rounded"
                  style={{
                    background: (METHOD_COLORS[req?.method || 'GET'] || '#666') + '22',
                    color: METHOD_COLORS[req?.method || 'GET'] || '#666',
                  }}
                >
                  {req?.method || 'GET'}
                </span>
                <span
                  className="text-[11px] truncate max-w-[120px]"
                  style={{ color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {req?.name || tab.draftState?.name || 'Untitled'}
                </span>
                {tab.isDirty && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--warning)',
                      flexShrink: 0,
                    }}
                  />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="btn-icon ml-0.5"
                  style={{ width: '16px', height: '16px', fontSize: '9px', color: 'var(--text-faint)' }}
                >
                  ✕
                </button>
              </div>
            );
          })}
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
