'use client';

import { useUIStore } from '@/lib/stores';
import { useRequestStore } from '@/lib/stores';
import { ApiResponse } from '@/lib/entities';
import { useState } from 'react';

export default function ResponseViewer() {
  const { loading, response } = useUIStore();
  const [activeResponseTab, setActiveResponseTab] = useState<'body' | 'headers' | 'meta'>('body');
  const [copied, setCopied] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [selectedExample, setSelectedExample] = useState<ApiResponse | null>(null);

  const activeTab = useUIStore.getState().tabs.find((t) => t.id === useUIStore.getState().activeTabId);
  const savedResponses = activeTab ? useRequestStore.getState().getResponses(activeTab.requestId) : [];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ minHeight: '200px' }}>
        <div className="text-center">
          <span className="animate-spin inline-block text-2xl" style={{ color: 'var(--accent-primary)' }}>⟳</span>
          <p className="text-[12px] mt-2" style={{ color: 'var(--text-muted)' }}>Sending request...</p>
        </div>
      </div>
    );
  }

  const displayResponse = selectedExample || response;

  if (!displayResponse) return null;

  const statusColor = displayResponse.status >= 200 && displayResponse.status < 300 ? 'var(--success)'
    : displayResponse.status >= 300 && displayResponse.status < 400 ? 'var(--warning)'
    : displayResponse.status >= 400 ? 'var(--danger)'
    : 'var(--text-muted)';

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const copyBody = () => {
    navigator.clipboard.writeText(displayResponse.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Try to detect JSON and format
  let formattedBody = displayResponse.body;
  try {
    formattedBody = JSON.stringify(JSON.parse(displayResponse.body), null, 2);
  } catch {}

  const handleViewSavedResponse = (resp: { id: string; name: string; status: number; statusText: string; headers: Record<string, string>; body: string }) => {
    setSelectedExample({
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
      body: resp.body,
      time: 0,
      size: new Blob([resp.body]).size,
    });
    setShowExamples(false);
  };

  const clearSelectedExample = () => {
    setSelectedExample(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--bg-page)' }}>
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
        <span className="text-[12px] font-bold" style={{ color: statusColor }}>
          {displayResponse.status} {displayResponse.statusText}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {displayResponse.time > 0 ? `${displayResponse.time}ms` : 'saved'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {formatSize(displayResponse.size)}
        </span>

        {selectedExample && (
          <button
            onClick={clearSelectedExample}
            className="text-[11px] font-medium px-2 py-0.5 rounded-lg"
            style={{ background: 'var(--warning)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            ← Back to live
          </button>
        )}

        {/* Saved responses dropdown */}
        {savedResponses.length > 0 && (
          <div className="relative ml-2">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1"
              style={{ background: 'var(--info)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              📋 Examples ({savedResponses.length})
              <span style={{ fontSize: '9px' }}>{showExamples ? '▴' : '▾'}</span>
            </button>
            {showExamples && (
              <div
                className="absolute left-0 top-full mt-1 z-50 rounded-lg overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-modal)',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  minWidth: '280px',
                }}
              >
                {savedResponses.map((sr) => {
                  const srColor = sr.status >= 200 && sr.status < 300 ? 'var(--success)'
                    : sr.status >= 400 ? 'var(--danger)' : 'var(--warning)';
                  return (
                    <button
                      key={sr.id}
                      onClick={() => handleViewSavedResponse(sr)}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 transition-all"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: `${srColor}22`, color: srColor }}
                      >
                        {sr.status}
                      </span>
                      <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        {sr.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto">
          <button
            onClick={copyBody}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: copied ? 'var(--success)' : 'var(--bg-hover)',
              color: copied ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied' : 'Copy Body'}
          </button>
        </div>
      </div>

      {/* Response tabs */}
      <div className="flex px-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['body', 'headers', 'meta'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveResponseTab(tab)}
            className={`tab-btn capitalize ${activeResponseTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Response content */}
      <div className="flex-1 overflow-auto p-4">
        {activeResponseTab === 'body' && (
          <pre
            className="text-[12px] leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
          >
            {formattedBody || '(empty response)'}
          </pre>
        )}

        {activeResponseTab === 'headers' && (
          <div className="space-y-1">
            {Object.entries(displayResponse.headers).map(([key, value]) => (
              <div key={key} className="flex gap-3 text-[12px]">
                <span className="font-semibold shrink-0" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{key}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</span>
              </div>
            ))}
            {Object.keys(displayResponse.headers).length === 0 && (
              <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No headers</p>
            )}
          </div>
        )}

        {activeResponseTab === 'meta' && (
          <div className="space-y-2">
            <MetaRow label="Status" value={`${displayResponse.status} ${displayResponse.statusText}`} color={statusColor} />
            <MetaRow label="Time" value={displayResponse.time > 0 ? `${displayResponse.time}ms` : 'N/A (saved response)'} />
            <MetaRow label="Size" value={formatSize(displayResponse.size)} />
            <MetaRow label="Headers" value={`${Object.keys(displayResponse.headers).length} headers`} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span style={{ color: 'var(--text-faint)', width: '80px' }}>{label}</span>
      <span className="font-medium" style={{ color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}
