'use client';

import { useUIStore } from '@/lib/stores';
import { useRequestStore } from '@/lib/stores';
import { useCollectionStore } from '@/lib/stores';
import { useHistoryStore } from '@/lib/stores';
import {
  METHOD_COLORS,
  DEFAULT_METHODS,
  HttpMethod,
  KVPair,
  RequestEntity,
  createKVPair,
  HistoryEntry,
} from '@/lib/entities';
import { resolveVariables, resolveUrlWithParams } from '@/lib/services/variable-resolver.service';
import { resolveAuth } from '@/lib/services/auth-resolver.service';
import { executeRequest } from '@/lib/services/request-executor.service';
import { requestRepository } from '@/lib/repositories/request.repository';
import { historyRepository } from '@/lib/repositories/history.repository';
import { useState, useEffect, useRef } from 'react';

export default function RequestBuilder() {
  const {
    tabs, activeTabId, updateDraft, saveDraft,
    setLoading, setResponse, loading, response,
  } = useUIStore();
  const { getRequest, getResponses } = useRequestStore();
  const { treeNodes } = useCollectionStore();
  const { addEntry } = useHistoryStore();
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');
  const sendFnRef = useRef<() => void>(() => {});

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const request = activeTab ? getRequest(activeTab.requestId) : null;
  // Merge request + draft
  const merged: RequestEntity | null = activeTab ? {
    ...(request || {} as RequestEntity),
    ...activeTab.draftState,
  } as RequestEntity : null;

  const update = (changes: Partial<RequestEntity>) => {
    if (activeTab) updateDraft(activeTab.id, changes);
  };

  const handleSend = async () => {
    if (!merged || !merged.url?.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      // Resolve variables
      const resolvedUrl = resolveUrlWithParams(merged.url, merged.params || [], {});
      
      // Resolve auth
      const authResult = resolveAuth(activeTab!.requestId, {
        tree: Object.values(treeNodes),
        requests: Object.values(useRequestStore.getState().requests),
        environments: [],
        activeEnvId: null,
      });

      // Build headers
      const headers: Record<string, string> = {};
      for (const h of (merged.headers || [])) {
        if (h.enabled && h.key.trim()) {
          headers[h.key] = resolveVariables(h.value, {});
        }
      }
      // Merge auth headers
      Object.assign(headers, authResult.headers);

      // Build body
      let body: string | undefined;
      if (merged.body?.mode !== 'none' && merged.body?.content) {
        body = resolveVariables(merged.body.content, {});
      }

      const result = await executeRequest({
        method: merged.method || 'GET',
        url: resolvedUrl + (authResult.urlSuffix ? (resolvedUrl.includes('?') ? '&' : '?') + authResult.urlSuffix : ''),
        headers,
        body,
      });

      setResponse(result);

      // Add to history
      const historyEntry: HistoryEntry = {
        id: Math.random().toString(36).slice(2, 10),
        method: merged.method || 'GET',
        url: merged.url || '',
        status: result.status,
        statusText: result.statusText,
        time: result.time,
        size: result.size,
        timestamp: Date.now(),
      };
      addEntry(historyEntry);
      historyRepository.create(historyEntry).catch(console.error);
    } catch (err: any) {
      setResponse({
        status: 0,
        statusText: 'Error',
        headers: {},
        body: err.message || 'Request failed',
        time: 0,
        size: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  // Keep ref updated for the event listener
  sendFnRef.current = handleSend;

  // Listen for Ctrl+Enter custom event from page.tsx
  useEffect(() => {
    const handler = () => sendFnRef.current();
    document.addEventListener('api-playground:send', handler);
    return () => document.removeEventListener('api-playground:send', handler);
  }, []);

  const handleSave = async () => {
    if (!activeTab) return;
    saveDraft(activeTab.id);
    // Persist to Dexie
    const updated = useRequestStore.getState().getRequest(activeTab.requestId);
    if (updated) {
      requestRepository.update(updated.id, updated).catch(console.error);
    }
  };

  if (!activeTab || !merged) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-faint)' }}>
        <div className="text-center">
          <div className="text-4xl mb-3">🚀</div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Select or create a request</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Use {'{{variable}}'} for dynamic values · Ctrl+Enter to send</p>
        </div>
      </div>
    );
  }

  const statusColor = response
    ? response.status >= 200 && response.status < 300 ? 'var(--success)'
    : response.status >= 300 && response.status < 400 ? 'var(--warning)'
    : response.status >= 400 ? 'var(--danger)'
    : 'var(--text-muted)'
    : 'var(--text-muted)';

  return (
    <div style={{ borderBottom: response || loading ? '1px solid var(--border-subtle)' : 'none' }}>
      {/* URL Bar */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Method selector */}
        <select
          value={merged.method || 'GET'}
          onChange={(e) => update({ method: e.target.value as HttpMethod })}
          className="text-[12px] font-bold px-2 py-2 rounded-lg border cursor-pointer"
          style={{
            background: 'var(--bg-input)',
            color: METHOD_COLORS[merged.method || 'GET'],
            borderColor: 'var(--border-default)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            width: '100px',
          }}
        >
          {DEFAULT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* URL input */}
        <input
          type="text"
          value={merged.url || ''}
          onChange={(e) => update({ url: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleSend()}
          placeholder="https://api.example.com/endpoint  (use {{variable}} for dynamic values)"
          className="input flex-1"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={loading || !merged.url?.trim()}
          className="btn-primary"
          style={{ minWidth: '80px' }}
        >
          {loading ? (
            <span className="animate-spin inline-block">⟳</span>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              Send
            </>
          )}
        </button>

        {/* Status badge */}
        {response && !loading && (
          <span
            className="text-[12px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: `${statusColor}18`, color: statusColor }}
          >
            {response.status} {response.statusText}
          </span>
        )}
      </div>

      {/* Request name */}
      <div className="px-4 pb-2">
        <input
          type="text"
          value={merged.name || ''}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Request name..."
          className="text-[12px] font-medium border-none bg-transparent outline-none w-full"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>

      {/* Tabs */}
      <div className="flex px-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {(['params', 'headers', 'body', 'auth'] as const).map((tab) => (
          <button key={tab} onClick={() => setReqTab(tab)} className={`tab-btn capitalize ${reqTab === tab ? 'active' : ''}`}>
            {tab}
            {tab === 'params' && (merged.params || []).filter((p) => p.enabled && p.key).length > 0 && (
              <span className="text-[9px] px-1 rounded-full" style={{ background: 'var(--accent-primary-soft)', color: '#000' }}>
                {(merged.params || []).filter((p) => p.enabled && p.key).length}
              </span>
            )}
            {tab === 'headers' && (merged.headers || []).filter((h) => h.enabled && h.key).length > 0 && (
              <span className="text-[9px] px-1 rounded-full" style={{ background: 'var(--accent-primary-soft)', color: '#000' }}>
                {(merged.headers || []).filter((h) => h.enabled && h.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3">
        {reqTab === 'params' && (
          <KVEditor
            items={merged.params || []}
            onChange={(params) => update({ params })}
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
          />
        )}
        {reqTab === 'headers' && (
          <KVEditor
            items={merged.headers || []}
            onChange={(headers) => update({ headers })}
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
          />
        )}
        {reqTab === 'body' && <BodyEditor body={merged.body || { mode: 'none', content: '', formData: [] }} onChange={(body) => update({ body })} />}
        {reqTab === 'auth' && <AuthEditor auth={merged.auth || { type: 'none', token: '', username: '', password: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header' }} onChange={(auth) => update({ auth })} />}
      </div>
    </div>
  );
}

// ═══ KV Editor ═══
function KVEditor({ items, onChange, keyPlaceholder, valuePlaceholder }: {
  items: KVPair[];
  onChange: (items: KVPair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const update = (id: string, field: 'key' | 'value', val: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, [field]: val } : item));
  };
  const toggle = (id: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
  };
  const remove = (id: string) => {
    const filtered = items.filter((item) => item.id !== id);
    onChange(filtered.length > 0 ? filtered : [createKVPair()]);
  };
  const add = () => onChange([...items, createKVPair()]);

  return (
    <div className="space-y-1.5">
      <div className="kv-row text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
        <span>Key</span>
        <span>Value</span>
        <span></span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="kv-row">
          <input
            value={item.key}
            onChange={(e) => update(item.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="input text-[12px]"
            style={{ padding: '5px 8px', opacity: item.enabled ? 1 : 0.4, fontFamily: 'var(--font-mono)' }}
          />
          <input
            value={item.value}
            onChange={(e) => update(item.id, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="input text-[12px]"
            style={{ padding: '5px 8px', opacity: item.enabled ? 1 : 0.4, fontFamily: 'var(--font-mono)' }}
          />
          <div className="flex items-center gap-0.5">
            <button onClick={() => toggle(item.id)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '10px', color: item.enabled ? 'var(--success)' : 'var(--text-faint)' }}>
              {item.enabled ? '✓' : '○'}
            </button>
            <button onClick={() => remove(item.id)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--danger)' }}>✕</button>
          </div>
        </div>
      ))}
      <button onClick={add} className="text-[11px] font-medium" style={{ color: 'var(--text-faint)' }}>+ Add</button>
    </div>
  );
}

// ═══ Body Editor ═══
function BodyEditor({ body, onChange }: { body: RequestEntity['body']; onChange: (body: RequestEntity['body']) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw'] as const).map((type) => (
          <button
            key={type}
            onClick={() => onChange({ ...body, mode: type })}
            className={`pill ${body.mode === type ? 'active' : ''}`}
          >
            {type === 'x-www-form-urlencoded' ? 'URL Encoded' : type === 'form-data' ? 'Form Data' : type}
          </button>
        ))}
      </div>

      {(body.mode === 'json' || body.mode === 'raw') && (
        <textarea
          value={body.content}
          onChange={(e) => onChange({ ...body, content: e.target.value })}
          placeholder={body.mode === 'json' ? '{\n  "key": "value"\n}' : 'Raw body content...'}
          rows={8}
          className="input resize-y"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5' }}
        />
      )}

      {(body.mode === 'form-data' || body.mode === 'x-www-form-urlencoded') && (
        <KVEditor
          items={body.formData || []}
          onChange={(formData) => onChange({ ...body, formData })}
          keyPlaceholder="Field name"
          valuePlaceholder="Value"
        />
      )}

      {body.mode === 'none' && (
        <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>This request has no body</p>
      )}
    </div>
  );
}

// ═══ Auth Editor ═══
function AuthEditor({ auth, onChange }: { auth: RequestEntity['auth']; onChange: (auth: RequestEntity['auth']) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {(['none', 'bearer', 'basic', 'apikey', 'inherit'] as const).map((type) => (
          <button
            key={type}
            onClick={() => onChange({ ...auth, type })}
            className={`pill ${auth.type === type ? 'active' : ''}`}
          >
            {type === 'none' ? 'No Auth' : type === 'bearer' ? 'Bearer Token' : type === 'basic' ? 'Basic Auth' : type === 'inherit' ? 'Inherit' : 'API Key'}
          </button>
        ))}
      </div>

      {auth.type === 'bearer' && (
        <input
          value={auth.token}
          onChange={(e) => onChange({ ...auth, token: e.target.value })}
          placeholder="Token (supports {{variable}})"
          className="input text-[12px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}

      {auth.type === 'basic' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={auth.username}
            onChange={(e) => onChange({ ...auth, username: e.target.value })}
            placeholder="Username"
            className="input text-[12px]"
          />
          <input
            type="password"
            value={auth.password}
            onChange={(e) => onChange({ ...auth, password: e.target.value })}
            placeholder="Password"
            className="input text-[12px]"
          />
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={auth.apiKeyName}
              onChange={(e) => onChange({ ...auth, apiKeyName: e.target.value })}
              placeholder="Key name (e.g. X-API-Key)"
              className="input text-[12px] flex-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <select
              value={auth.apiKeyIn}
              onChange={(e) => onChange({ ...auth, apiKeyIn: e.target.value as 'header' | 'query' })}
              className="input text-[11px]"
              style={{ padding: '6px 8px', cursor: 'pointer', width: '90px' }}
            >
              <option value="header">Header</option>
              <option value="query">Query</option>
            </select>
          </div>
          <input
            value={auth.apiKey}
            onChange={(e) => onChange({ ...auth, apiKey: e.target.value })}
            placeholder="API Key value (supports {{variable}})"
            className="input text-[12px]"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
      )}

      {auth.type === 'inherit' && (
        <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Auth will be inherited from the parent folder or collection.</p>
      )}

      {auth.type === 'none' && (
        <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No authentication configured</p>
      )}
    </div>
  );
}
