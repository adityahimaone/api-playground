'use client';

import { usePlaygroundStore } from '@/lib/store';
import { useState } from 'react';

export default function ResponseViewer() {
  const { response, loading, activeResponseTab, setActiveResponseTab } = usePlaygroundStore();
  const [copied, setCopied] = useState(false);

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

  if (!response) return null;

  const statusColor = response.status >= 200 && response.status < 300 ? 'var(--success)'
    : response.status >= 300 && response.status < 400 ? 'var(--warning)'
    : response.status >= 400 ? 'var(--danger)' : 'var(--text-muted)';

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const copyBody = () => {
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Try to detect JSON and format
  let formattedBody = response.body;
  try {
    formattedBody = JSON.stringify(JSON.parse(response.body), null, 2);
  } catch {}

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--bg-page)' }}>
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
        <span className="text-[12px] font-bold" style={{ color: statusColor }}>
          {response.status} {response.statusText}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {response.time}ms
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {formatSize(response.size)}
        </span>
        <div className="ml-auto">
          <button
            onClick={copyBody}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${copied ? '' : ''}`}
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
        {(['body', 'headers', 'meta'] as const).map(tab => (
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
            {Object.entries(response.headers).map(([key, value]) => (
              <div key={key} className="flex gap-3 text-[12px]">
                <span className="font-semibold shrink-0" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{key}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</span>
              </div>
            ))}
            {Object.keys(response.headers).length === 0 && (
              <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No headers</p>
            )}
          </div>
        )}

        {activeResponseTab === 'meta' && (
          <div className="space-y-2">
            <MetaRow label="Status" value={`${response.status} ${response.statusText}`} color={statusColor} />
            <MetaRow label="Time" value={`${response.time}ms`} />
            <MetaRow label="Size" value={formatSize(response.size)} />
            <MetaRow label="Headers" value={`${Object.keys(response.headers).length} headers`} />
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
