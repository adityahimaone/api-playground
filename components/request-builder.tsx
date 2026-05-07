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
  createVariableEntity,
  HistoryEntry,
  VariableEntity,
  VARIABLE_SCOPE_COLORS,
} from '@/lib/entities';
import { resolveVariables, resolveUrlWithParams, ResolveContext, extractVariables, getMissingVariables, previewResolved } from '@/lib/services/variable-resolver.service';
import { resolveAuth } from '@/lib/services/auth-resolver.service';
import { executeRequest } from '@/lib/services/request-executor.service';
import { requestRepository } from '@/lib/repositories/request.repository';
import { historyRepository } from '@/lib/repositories/history.repository';
import { variableRepository } from '@/lib/repositories/variable.repository';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function RequestBuilder() {
  const {
    tabs, activeTabId, updateDraft, saveDraft,
    setLoading, setResponse, loading, response,
  } = useUIStore();
  const { getRequest, getResponses } = useRequestStore();
  const { treeNodes, getNodeChildren } = useCollectionStore();
  const { addEntry } = useHistoryStore();
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');
  const sendFnRef = useRef<() => void>(() => {});
  const [urlPreview, setUrlPreview] = useState<{ resolved: string; missing: string[] } | null>(null);

  // ── Feature 4: Local variables ──
  const [localVariables, setLocalVariables] = useState<VariableEntity[]>([]);
  const [showLocalVars, setShowLocalVars] = useState(false);
  const [newLocalKey, setNewLocalKey] = useState('');
  const [newLocalValue, setNewLocalValue] = useState('');

  // ── Feature 5: Autocomplete state ──
  const [autocomplete, setAutocomplete] = useState<{
    visible: boolean;
    query: string;
    suggestions: VariableEntity[];
    selectedIndex: number;
  }>({ visible: false, query: '', suggestions: [], selectedIndex: 0 });

  // ── All available variables for autocomplete ──
  const [allVariables, setAllVariables] = useState<VariableEntity[]>([]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const request = activeTab ? getRequest(activeTab.requestId) : null;
  // Merge request + draft
  const merged: RequestEntity | null = activeTab ? {
    ...(request || {} as RequestEntity),
    ...activeTab.draftState,
  } as RequestEntity : null;

  // Realtime URL preview — debounce variable resolution
  // Re-runs when URL changes OR when variables change (via custom event)
  const [variableVersion, setVariableVersion] = useState(0);

  useEffect(() => {
    const handler = () => setVariableVersion(v => v + 1);
    document.addEventListener('variables:changed', handler);
    return () => document.removeEventListener('variables:changed', handler);
  }, []);

  useEffect(() => {
    if (!merged?.url || !merged.url.includes('{{')) {
      setUrlPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      const globalVars = await variableRepository.getByScope('global');
      const activeEnvId = useUIStore.getState().activeEnvId;
      const envVars = activeEnvId ? await variableRepository.getByScope('environment', activeEnvId) : [];
      const ctx: ResolveContext = { globalVariables: globalVars, environmentVariables: envVars, activeScopes: useUIStore.getState().activeVariableScopes };
      setUrlPreview(previewResolved(merged.url!, ctx));
    }, 300);
    return () => clearTimeout(timer);
  }, [merged?.url, variableVersion]);

  // ── Load local variables for current tab ──
  useEffect(() => {
    if (!activeTabId) {
      setLocalVariables([]);
      return;
    }
    const loadLocal = async () => {
      const vars = await variableRepository.getByScope('local', activeTabId);
      setLocalVariables(vars);
    };
    loadLocal();
  }, [activeTabId]);

  // ── Load all variables for autocomplete ──
  useEffect(() => {
    const loadAll = async () => {
      const globalVars = await variableRepository.getByScope('global');
      const activeEnvId = useUIStore.getState().activeEnvId;
      const envVars = activeEnvId ? await variableRepository.getByScope('environment', activeEnvId) : [];

      // Collection variables — find parent collection of current request
      let collVars: VariableEntity[] = [];
      if (merged?.url) {
        // Try to find which collection the request belongs to
        for (const rootId of Object.values(treeNodes).filter(n => n.parentId === null && n.type === 'collection').map(n => n.id)) {
          const vars = await variableRepository.getByScope('collection', rootId);
          collVars = [...collVars, ...vars];
        }
      }

      // Local variables for current tab
      const localVars = activeTabId
        ? await variableRepository.getByScope('local', activeTabId)
        : [];

      setAllVariables([...localVars, ...envVars, ...collVars, ...globalVars]);
    };
    loadAll();
  }, [variableVersion, activeTabId, treeNodes]);

  const update = (changes: Partial<RequestEntity>) => {
    if (activeTab) updateDraft(activeTab.id, changes);
  };

  const handleSend = async () => {
    if (!merged || !merged.url?.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      // Load variables from all scopes
      const globalVars = await variableRepository.getByScope('global');
      const activeEnvId = useUIStore.getState().activeEnvId;
      const envVars = activeEnvId ? await variableRepository.getByScope('environment', activeEnvId) : [];
      // Collection vars
      let collVars: VariableEntity[] = [];
      for (const rootId of Object.values(treeNodes).filter(n => n.parentId === null && n.type === 'collection').map(n => n.id)) {
        const vars = await variableRepository.getByScope('collection', rootId);
        collVars = [...collVars, ...vars];
      }
      // Local vars for current tab
      const localVars = activeTabId
        ? await variableRepository.getByScope('local', activeTabId)
        : [];

      const varContext: ResolveContext = {
        localVariables: localVars,
        collectionVariables: collVars,
        globalVariables: globalVars,
        environmentVariables: envVars,
        activeScopes: useUIStore.getState().activeVariableScopes,
      };

      // Resolve variables in URL
      const resolvedUrl = resolveUrlWithParams(merged.url, merged.params || [], varContext);
      
      // Resolve auth
      const authResult = resolveAuth(activeTab!.requestId, {
        tree: Object.values(treeNodes),
        requests: Object.values(useRequestStore.getState().requests),
        environments: [],
        activeEnvId: null,
      });

      // Build headers with resolved variables
      const headers: Record<string, string> = {};
      for (const h of (merged.headers || [])) {
        if (h.enabled && h.key.trim()) {
          headers[resolveVariables(h.key, varContext)] = resolveVariables(h.value, varContext);
        }
      }
      // Merge auth headers
      Object.assign(headers, authResult.headers);

      // Build body with resolved variables
      let body: string | undefined;
      if (merged.body?.mode !== 'none' && merged.body?.content) {
        body = resolveVariables(merged.body.content, varContext);
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

  // ── Feature 4: Local variable CRUD ──
  const addLocalVariable = async () => {
    if (!activeTabId || !newLocalKey.trim()) return;
    const newVar = createVariableEntity(newLocalKey.trim(), newLocalValue, 'local', activeTabId);
    await variableRepository.create(newVar);
    setLocalVariables((prev) => [...prev, newVar]);
    setNewLocalKey('');
    setNewLocalValue('');
    document.dispatchEvent(new CustomEvent('variables:changed'));
  };

  const updateLocalVariable = async (id: string, changes: Partial<VariableEntity>) => {
    await variableRepository.update(id, changes);
    setLocalVariables((prev) => prev.map((v) => v.id === id ? { ...v, ...changes } : v));
    document.dispatchEvent(new CustomEvent('variables:changed'));
  };

  const deleteLocalVariable = async (id: string) => {
    await variableRepository.delete(id);
    setLocalVariables((prev) => prev.filter((v) => v.id !== id));
    document.dispatchEvent(new CustomEvent('variables:changed'));
  };

  // ── Feature 5: Autocomplete handlers ──
  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    update({ url: value });

    // Check if user just typed "{{" — show autocomplete
    const lastDoubleBrace = value.lastIndexOf('{{');
    if (lastDoubleBrace >= 0) {
      // Check if there's a closing "}}" after the opening
      const afterOpen = value.slice(lastDoubleBrace + 2);
      const closingIndex = afterOpen.indexOf('}}');
      if (closingIndex === -1) {
        // No closing yet — show autocomplete
        const query = afterOpen;
        const filtered = allVariables.filter(
          v => v.enabled && v.key.trim() && v.key.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        setAutocomplete({ visible: true, query, suggestions: filtered, selectedIndex: 0 });
        return;
      }
    }
    setAutocomplete({ visible: false, query: '', suggestions: [], selectedIndex: 0 });
  }, [allVariables, update]);

  const selectAutocomplete = useCallback((varName: string) => {
    if (!merged?.url) return;
    const lastDoubleBrace = merged.url.lastIndexOf('{{');
    if (lastDoubleBrace >= 0) {
      const before = merged.url.slice(0, lastDoubleBrace + 2);
      const newValue = before + varName + '}}';
      update({ url: newValue });
    }
    setAutocomplete({ visible: false, query: '', suggestions: [], selectedIndex: 0 });
  }, [merged?.url, update]);

  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (autocomplete.visible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocomplete(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1),
        }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocomplete(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
      } else if (e.key === 'Enter' && autocomplete.suggestions.length > 0) {
        e.preventDefault();
        selectAutocomplete(autocomplete.suggestions[autocomplete.selectedIndex].key);
      } else if (e.key === 'Escape') {
        setAutocomplete({ visible: false, query: '', suggestions: [], selectedIndex: 0 });
      }
    } else if (e.key === 'Enter' && !loading) {
      handleSend();
    }
  }, [autocomplete, selectAutocomplete, loading, handleSend]);

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

        {/* URL input with autocomplete */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={merged.url || ''}
            onChange={handleUrlChange}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://api.example.com/endpoint  (use {{variable}} for dynamic values)"
            className="input w-full"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
            autoComplete="off"
          />

          {/* Autocomplete dropdown */}
          {autocomplete.visible && autocomplete.suggestions.length > 0 && (
            <div
              className="absolute z-50 mt-1 rounded-lg overflow-hidden"
              style={{
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              {autocomplete.suggestions.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => selectAutocomplete(v.key)}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12px]"
                  style={{
                    background: i === autocomplete.selectedIndex ? 'var(--accent-primary-soft)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i === autocomplete.selectedIndex ? 'var(--accent-primary-soft)' : 'transparent')}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {v.key}
                  </span>
                  <span
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{
                      background: v.scope === 'global' ? '#6b728022' : v.scope === 'environment' ? '#3b82f622' : v.scope === 'collection' ? '#8b5cf622' : '#f9731622',
                      color: v.scope === 'global' ? '#6b7280' : v.scope === 'environment' ? '#3b82f6' : v.scope === 'collection' ? '#8b5cf6' : '#f97316',
                    }}
                  >
                    {v.scope}
                  </span>
                </button>
              ))}
            </div>
          )}
          {autocomplete.visible && autocomplete.suggestions.length === 0 && autocomplete.query.length > 0 && (
            <div
              className="absolute z-50 mt-1 rounded-lg overflow-hidden"
              style={{
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                padding: '8px 12px',
              }}
            >
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                No matching variables. Type to create: {'{{' + autocomplete.query + '}}'}
              </span>
            </div>
          )}
        </div>

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

      {/* ═══ URL Variable Preview ═══ */}
      {urlPreview && (
        <div className="px-4 pb-2">
          {urlPreview.missing.length > 0 ? (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span style={{ color: 'var(--warning)' }}>⚠</span>
              <span style={{ color: 'var(--text-muted)' }}>Resolved:</span>
              <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {urlPreview.resolved}
              </code>
              <span style={{ color: 'var(--danger)' }}>— missing: {urlPreview.missing.join(', ')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span style={{ color: 'var(--success)' }}>✓</span>
              <span style={{ color: 'var(--text-muted)' }}>Resolved:</span>
              <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {urlPreview.resolved}
              </code>
            </div>
          )}
        </div>
      )}

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

      {/* ═══ Feature 4: Local Variables (collapsible) ═══ */}
      <div className="px-4 pb-2">
        <button
          onClick={() => setShowLocalVars(!showLocalVars)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
        >
          <span>{showLocalVars ? '▾' : '▸'}</span>
          <span>Local Variables</span>
          {localVariables.length > 0 && (
            <span
              className="text-[9px] px-1 rounded-full"
              style={{ background: '#f9731622', color: '#f97316' }}
            >
              {localVariables.length}
            </span>
          )}
        </button>
        {showLocalVars && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1 text-[10px] font-semibold uppercase tracking-wider items-center" style={{ color: 'var(--text-faint)' }}>
              <span style={{ flex: 1 }}>Key</span>
              <span style={{ flex: 1 }}>Value</span>
              <span style={{ width: '22px', flexShrink: 0 }}></span>
              <span style={{ width: '22px', flexShrink: 0 }}></span>
            </div>
            {localVariables.map((v) => (
              <div key={v.id} className="flex gap-1 items-center">
                <input
                  value={v.key}
                  onChange={(e) => updateLocalVariable(v.id, { key: e.target.value })}
                  placeholder="var_name"
                  className="input text-[12px]"
                  style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', flex: 1, opacity: v.enabled ? 1 : 0.4 }}
                />
                <input
                  value={v.currentValue}
                  onChange={(e) => updateLocalVariable(v.id, { currentValue: e.target.value })}
                  placeholder="value"
                  className="input text-[12px]"
                  style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', flex: 1, opacity: v.enabled ? 1 : 0.4 }}
                />
                <button
                  onClick={() => updateLocalVariable(v.id, { enabled: !v.enabled })}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', fontSize: '10px', color: v.enabled ? 'var(--success)' : 'var(--text-faint)' }}
                >
                  {v.enabled ? '✓' : '○'}
                </button>
                <button
                  onClick={() => deleteLocalVariable(v.id)}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--danger)' }}
                >✕</button>
              </div>
            ))}
            {/* Add local variable inline */}
            <div className="flex gap-1 items-center">
              <input
                value={newLocalKey}
                onChange={(e) => setNewLocalKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newLocalKey.trim()) addLocalVariable(); }}
                placeholder="new_var"
                className="input text-[12px]"
                style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', flex: 1 }}
              />
              <input
                value={newLocalValue}
                onChange={(e) => setNewLocalValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newLocalKey.trim()) addLocalVariable(); }}
                placeholder="value"
                className="input text-[12px]"
                style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', flex: 1 }}
              />
              <button
                onClick={addLocalVariable}
                disabled={!newLocalKey.trim()}
                className="btn-icon"
                style={{ width: '22px', height: '22px', fontSize: '12px', color: newLocalKey.trim() ? 'var(--accent-primary)' : 'var(--text-faint)' }}
              >+</button>
              <span style={{ width: '22px', flexShrink: 0 }}></span>
            </div>
          </div>
        )}
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
            allVariables={allVariables}
          />
        )}
        {reqTab === 'headers' && (
          <KVEditor
            items={merged.headers || []}
            onChange={(headers) => update({ headers })}
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
            allVariables={allVariables}
          />
        )}
        {reqTab === 'body' && <BodyEditor body={merged.body || { mode: 'none', content: '', formData: [] }} onChange={(body) => update({ body })} />}
        {reqTab === 'auth' && <AuthEditor auth={merged.auth || { type: 'none', token: '', username: '', password: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header' }} onChange={(auth) => update({ auth })} />}
      </div>
    </div>
  );
}

// ═══ KV Editor ═══
function KVEditor({ items, onChange, keyPlaceholder, valuePlaceholder, allVariables }: {
  items: KVPair[];
  onChange: (items: KVPair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  allVariables?: VariableEntity[];
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

  // Helper: get scope color for a variable name found in value
  const getVarScopeColor = (value: string): string | null => {
    if (!allVariables || !value.includes('{{')) return null;
    const match = value.match(/\{\{([^}]+)\}\}/);
    if (!match) return null;
    const varName = match[1].trim();
    const found = allVariables.find(v => v.enabled && v.key.trim() === varName);
    if (!found) return null;
    return VARIABLE_SCOPE_COLORS[found.scope] || null;
  };

  return (
    <div className="space-y-1.5">
      <div className="kv-row text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
        <span>Key</span>
        <span>Value</span>
        <span></span>
      </div>
      {items.map((item) => {
        const scopeColor = getVarScopeColor(item.value);
        return (
          <div key={item.id} className="kv-row">
            <input
              value={item.key}
              onChange={(e) => update(item.id, 'key', e.target.value)}
              placeholder={keyPlaceholder}
              className="input text-[12px]"
              style={{ padding: '5px 8px', opacity: item.enabled ? 1 : 0.4, fontFamily: 'var(--font-mono)' }}
            />
            <div className="relative flex-1">
              {scopeColor && (
                <span
                  className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l"
                  style={{ background: scopeColor }}
                />
              )}
              <input
                value={item.value}
                onChange={(e) => update(item.id, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                className="input text-[12px] w-full"
                style={{
                  padding: '5px 8px',
                  opacity: item.enabled ? 1 : 0.4,
                  fontFamily: 'var(--font-mono)',
                  ...(scopeColor ? { paddingLeft: '10px' } : {}),
                }}
              />
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => toggle(item.id)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '10px', color: item.enabled ? 'var(--success)' : 'var(--text-faint)' }}>
                {item.enabled ? '✓' : '○'}
              </button>
              <button onClick={() => remove(item.id)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
        );
      })}
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
