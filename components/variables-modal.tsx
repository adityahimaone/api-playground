'use client';

import { usePlaygroundStore } from '@/lib/store';
import { createKVPair } from '@/lib/types';
import { useState } from 'react';

export default function VariablesModal({ onClose }: { onClose: () => void }) {
  const {
    globalVariables, addGlobalVariable, updateGlobalVariable,
    toggleGlobalVariable, deleteGlobalVariable,
    environments, activeEnvId, setActiveEnvId,
    addEnvironment, deleteEnvironment, updateEnvironment,
  } = usePlaygroundStore();
  const [newEnvName, setNewEnvName] = useState('');
  const [envTab, setEnvTab] = useState<'global' | string>('global');

  const activeEnv = environments.find(e => e.id === activeEnvId);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card w-full max-w-2xl" style={{ padding: '24px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Variables</h2>
          <button onClick={onClose} className="btn-icon" style={{ width: '28px', height: '28px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <p className="text-[11px] mb-4" style={{ color: 'var(--text-faint)' }}>
          Use {'{{variable_name}}'} in URL, headers, body, or auth. Global vars are always active. Environment vars activate when selected.
        </p>

        {/* Tab bar: global + environments */}
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setEnvTab('global')}
            className={`pill ${envTab === 'global' ? 'active' : ''}`}
          >
            Global
          </button>
          {environments.map(env => (
            <div key={env.id} className="flex items-center gap-0.5">
              <button
                onClick={() => { setEnvTab(env.id); setActiveEnvId(env.id); }}
                className={`pill ${envTab === env.id ? 'active' : ''}`}
              >
                {env.name}
              </button>
              <button
                onClick={() => deleteEnvironment(env.id)}
                className="btn-icon"
                style={{ width: '18px', height: '18px', fontSize: '9px', color: 'var(--danger)' }}
              >✕</button>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input
              value={newEnvName}
              onChange={e => setNewEnvName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newEnvName.trim()) {
                  addEnvironment(newEnvName.trim());
                  setNewEnvName('');
                }
              }}
              placeholder="New env..."
              className="input text-[11px]"
              style={{ padding: '3px 8px', width: '110px' }}
            />
            <button
              onClick={() => { if (newEnvName.trim()) { addEnvironment(newEnvName.trim()); setNewEnvName(''); } }}
              className="btn-icon"
              style={{ width: '22px', height: '22px', fontSize: '14px', color: 'var(--accent-primary)' }}
            >+</button>
          </div>
        </div>

        {/* Variables table */}
        <div className="space-y-1">
          <div className="kv-row text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
            <span>Key</span>
            <span>Value</span>
            <span></span>
          </div>

          {envTab === 'global' && globalVariables.map(v => (
            <div key={v.id} className="kv-row">
              <input
                value={v.key}
                onChange={e => updateGlobalVariable(v.id, 'key', e.target.value)}
                placeholder="variable_name"
                className="input text-[12px]"
                style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4 }}
              />
              <input
                value={v.value}
                onChange={e => updateGlobalVariable(v.id, 'value', e.target.value)}
                placeholder="value"
                className="input text-[12px]"
                style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4 }}
              />
              <div className="flex items-center gap-0.5">
                <button onClick={() => toggleGlobalVariable(v.id)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '10px', color: v.enabled ? 'var(--success)' : 'var(--text-faint)' }}>
                  {v.enabled ? '✓' : '○'}
                </button>
                <button onClick={() => deleteGlobalVariable(v.id)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--danger)' }}>✕</button>
              </div>
            </div>
          ))}

          {envTab === 'global' && (
            <button onClick={addGlobalVariable} className="text-[11px] font-medium" style={{ color: 'var(--text-faint)' }}>+ Add Variable</button>
          )}

          {envTab !== 'global' && activeEnv && activeEnv.variables.map(v => (
            <div key={v.id} className="kv-row">
              <input
                value={v.key}
                onChange={e => updateEnvironment(activeEnv.id, {
                  variables: activeEnv.variables.map(vv => vv.id === v.id ? { ...vv, key: e.target.value } : vv)
                })}
                placeholder="variable_name"
                className="input text-[12px]"
                style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4 }}
              />
              <input
                value={v.value}
                onChange={e => updateEnvironment(activeEnv.id, {
                  variables: activeEnv.variables.map(vv => vv.id === v.id ? { ...vv, value: e.target.value } : vv)
                })}
                placeholder="value"
                className="input text-[12px]"
                style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4 }}
              />
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => updateEnvironment(activeEnv.id, {
                    variables: activeEnv.variables.map(vv => vv.id === v.id ? { ...vv, enabled: !vv.enabled } : vv)
                  })}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', fontSize: '10px', color: v.enabled ? 'var(--success)' : 'var(--text-faint)' }}
                >{v.enabled ? '✓' : '○'}</button>
                <button
                  onClick={() => updateEnvironment(activeEnv.id, {
                    variables: activeEnv.variables.filter(vv => vv.id !== v.id)
                  })}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--danger)' }}
                >✕</button>
              </div>
            </div>
          ))}

          {envTab !== 'global' && activeEnv && (
            <button
              onClick={() => updateEnvironment(activeEnv.id, {
                variables: [...activeEnv.variables, createKVPair()]
              })}
              className="text-[11px] font-medium"
              style={{ color: 'var(--text-faint)' }}
            >+ Add Variable</button>
          )}
        </div>
      </div>
    </div>
  );
}
