'use client';

import { usePlaygroundStore } from '@/lib/store';
import { DEFAULT_METHODS, METHOD_COLORS, KVPair, createKVPair } from '@/lib/types';
import { useState } from 'react';

export default function RequestBuilder() {
  const { activeRequest, updateRequest, sendRequest, loading, response } = usePlaygroundStore();
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');

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
          value={activeRequest.method}
          onChange={e => updateRequest({ method: e.target.value as any })}
          className="text-[12px] font-bold px-2 py-2 rounded-lg border cursor-pointer"
          style={{
            background: 'var(--bg-input)',
            color: METHOD_COLORS[activeRequest.method],
            borderColor: 'var(--border-default)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            width: '100px',
          }}
        >
          {DEFAULT_METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* URL input */}
        <input
          type="text"
          value={activeRequest.url}
          onChange={e => updateRequest({ url: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && !loading && sendRequest()}
          placeholder="https://api.example.com/endpoint  (use {{variable}} for dynamic values)"
          className="input flex-1"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
        />

        {/* Send button */}
        <button
          onClick={sendRequest}
          disabled={loading || !activeRequest.url.trim()}
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
          value={activeRequest.name}
          onChange={e => updateRequest({ name: e.target.value })}
          placeholder="Request name..."
          className="text-[12px] font-medium border-none bg-transparent outline-none w-full"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>

      {/* Tabs */}
      <div className="flex px-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {(['params', 'headers', 'body', 'auth'] as const).map(tab => (
          <button key={tab} onClick={() => setReqTab(tab)} className={`tab-btn capitalize ${reqTab === tab ? 'active' : ''}`}>
            {tab}
            {tab === 'params' && activeRequest.params.filter(p => p.enabled && p.key).length > 0 && (
              <span className="text-[9px] px-1 rounded-full" style={{ background: 'var(--accent-primary-soft)', color: '#000' }}>
                {activeRequest.params.filter(p => p.enabled && p.key).length}
              </span>
            )}
            {tab === 'headers' && activeRequest.headers.filter(h => h.enabled && h.key).length > 0 && (
              <span className="text-[9px] px-1 rounded-full" style={{ background: 'var(--accent-primary-soft)', color: '#000' }}>
                {activeRequest.headers.filter(h => h.enabled && h.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3">
        {reqTab === 'params' && (
          <KVEditor
            items={activeRequest.params}
            onChange={params => updateRequest({ params })}
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
          />
        )}
        {reqTab === 'headers' && (
          <KVEditor
            items={activeRequest.headers}
            onChange={headers => updateRequest({ headers })}
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
          />
        )}
        {reqTab === 'body' && <BodyEditor />}
        {reqTab === 'auth' && <AuthEditor />}
      </div>
    </div>
  );
}

function KVEditor({ items, onChange, keyPlaceholder, valuePlaceholder }: {
  items: KVPair[];
  onChange: (items: KVPair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const update = (id: string, field: 'key' | 'value', val: string) => {
    onChange(items.map(item => item.id === id ? { ...item, [field]: val } : item));
  };
  const toggle = (id: string) => {
    onChange(items.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item));
  };
  const remove = (id: string) => {
    const filtered = items.filter(item => item.id !== id);
    onChange(filtered.length > 0 ? filtered : [createKVPair()]);
  };
  const add = () => onChange([...items, createKVPair()]);

  return (
    <div className="space-y-1.5">
      {/* Header */}
      <div className="kv-row text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
        <span>Key</span>
        <span>Value</span>
        <span></span>
      </div>
      {items.map(item => (
        <div key={item.id} className="kv-row">
          <input
            value={item.key}
            onChange={e => update(item.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="input text-[12px]"
            style={{ padding: '5px 8px', opacity: item.enabled ? 1 : 0.4, fontFamily: 'var(--font-mono)' }}
          />
          <input
            value={item.value}
            onChange={e => update(item.id, 'value', e.target.value)}
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

function BodyEditor() {
  const { activeRequest, updateRequest } = usePlaygroundStore();

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw'] as const).map(type => (
          <button
            key={type}
            onClick={() => updateRequest({ bodyType: type })}
            className={`pill ${activeRequest.bodyType === type ? 'active' : ''}`}
          >
            {type === 'x-www-form-urlencoded' ? 'URL Encoded' : type === 'form-data' ? 'Form Data' : type}
          </button>
        ))}
      </div>

      {(activeRequest.bodyType === 'json' || activeRequest.bodyType === 'raw') && (
        <textarea
          value={activeRequest.body}
          onChange={e => updateRequest({ body: e.target.value })}
          placeholder={activeRequest.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw body content...'}
          rows={8}
          className="input resize-y"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5' }}
        />
      )}

      {(activeRequest.bodyType === 'form-data' || activeRequest.bodyType === 'x-www-form-urlencoded') && (
        <KVEditor
          items={activeRequest.formData}
          onChange={formData => updateRequest({ formData })}
          keyPlaceholder="Field name"
          valuePlaceholder="Value"
        />
      )}

      {activeRequest.bodyType === 'none' && (
        <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>This request has no body</p>
      )}
    </div>
  );
}

function AuthEditor() {
  const { activeRequest, updateRequest } = usePlaygroundStore();
  const auth = activeRequest.auth;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['none', 'bearer', 'basic'] as const).map(type => (
          <button
            key={type}
            onClick={() => updateRequest({ auth: { ...auth, type } })}
            className={`pill ${auth.type === type ? 'active' : ''}`}
          >
            {type === 'none' ? 'No Auth' : type === 'bearer' ? 'Bearer Token' : 'Basic Auth'}
          </button>
        ))}
      </div>

      {auth.type === 'bearer' && (
        <input
          value={auth.token}
          onChange={e => updateRequest({ auth: { ...auth, token: e.target.value } })}
          placeholder="Token (supports {{variable}})"
          className="input text-[12px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}

      {auth.type === 'basic' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={auth.username}
            onChange={e => updateRequest({ auth: { ...auth, username: e.target.value } })}
            placeholder="Username"
            className="input text-[12px]"
          />
          <input
            type="password"
            value={auth.password}
            onChange={e => updateRequest({ auth: { ...auth, password: e.target.value } })}
            placeholder="Password"
            className="input text-[12px]"
          />
        </div>
      )}

      {auth.type === 'none' && (
        <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No authentication configured</p>
      )}
    </div>
  );
}
