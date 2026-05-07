'use client';

import { useState, useEffect } from 'react';
import { Environment, VariableEntity, createEnvironment, createVariableEntity, VariableScope, VARIABLE_SCOPE_COLORS } from '@/lib/entities';
import { environmentRepository } from '@/lib/repositories/environment.repository';
import { variableRepository } from '@/lib/repositories/variable.repository';
import { useUIStore } from '@/lib/stores';

// Scope definitions for the toggle bar
const SCOPE_DEFS: { scope: VariableScope; label: string }[] = [
  { scope: 'global', label: 'Global' },
  { scope: 'environment', label: 'Env' },
  { scope: 'collection', label: 'Collection' },
  { scope: 'local', label: 'Local' },
];

export default function VariablesModal({ onClose }: { onClose: () => void }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('global');
  const [newEnvName, setNewEnvName] = useState('');
  const [envVariables, setEnvVariables] = useState<VariableEntity[]>([]);

  const { activeVariableScopes, toggleVariableScope } = useUIStore();

  // Load from Dexie
  useEffect(() => {
    environmentRepository.getAll().then((envs) => {
      setEnvironments(envs);
      const active = envs.find((e) => e.isActive);
      if (active) {
        setActiveEnvId(active.id);
        setSelectedTab(active.id);
      }
    });
  }, []);

  // Load variables when selectedTab changes
  useEffect(() => {
    const loadVariables = async () => {
      if (selectedTab === 'global') {
        const vars = await variableRepository.getByScope('global');
        setEnvVariables(vars);
      } else {
        const vars = await variableRepository.getByScope('environment', selectedTab);
        setEnvVariables(vars);
      }
    };
    loadVariables();
  }, [selectedTab, environments]);

  const addEnv = async () => {
    if (!newEnvName.trim()) return;
    const env = createEnvironment(newEnvName.trim());
    await environmentRepository.create(env);
    setEnvironments((prev) => [...prev, env]);
    setNewEnvName('');
  };

  const deleteEnv = async (id: string) => {
    await variableRepository.deleteByScopeId(id);
    await environmentRepository.delete(id);
    setEnvironments((prev) => prev.filter((e) => e.id !== id));
    if (activeEnvId === id) setActiveEnvId(null);
  };

  const notifyVariablesChanged = () => document.dispatchEvent(new CustomEvent('variables:changed'));

  const addVariable = async () => {
    const scope: VariableScope = selectedTab === 'global' ? 'global' : 'environment';
    const scopeId = selectedTab === 'global' ? undefined : selectedTab;
    const newVar = createVariableEntity('', '', scope, scopeId);
    await variableRepository.create(newVar);
    setEnvVariables((prev) => [...prev, newVar]);
    notifyVariablesChanged();
  };

  const updateVariable = async (id: string, changes: Partial<VariableEntity>) => {
    await variableRepository.update(id, changes);
    setEnvVariables((prev) => prev.map((v) => v.id === id ? { ...v, ...changes } : v));
    notifyVariablesChanged();
  };

  const deleteVariable = async (id: string) => {
    await variableRepository.delete(id);
    setEnvVariables((prev) => prev.filter((v) => v.id !== id));
    notifyVariablesChanged();
  };

  const selectEnv = async (envId: string) => {
    setSelectedTab(envId);
    setActiveEnvId(envId);
    await environmentRepository.setActive(envId);
    setEnvironments((prev) => prev.map((e) => ({ ...e, isActive: e.id === envId })));
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card w-full max-w-3xl" style={{ padding: '24px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Variables</h2>
          <button onClick={onClose} className="btn-icon" style={{ width: '28px', height: '28px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
          Use {'{{variable_name}}'} in URL, headers, body, or auth. Toggle scopes below to control which variables are active during resolution.
        </p>

        {/* ═══ Scope Active Toggles ═══ */}
        <div className="flex items-center gap-1.5 mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--text-faint)' }}>
            Active Scopes:
          </span>
          {SCOPE_DEFS.map(({ scope, label }) => {
            const isActive = activeVariableScopes[scope];
            const color = VARIABLE_SCOPE_COLORS[scope];
            return (
              <button
                key={scope}
                onClick={() => toggleVariableScope(scope)}
                className="flex items-center gap-1 text-[10px] font-medium rounded-full px-2.5 py-1 transition-all"
                style={{
                  background: isActive ? `${color}20` : 'var(--bg-hover)',
                  color: isActive ? color : 'var(--text-faint)',
                  border: `1.5px solid ${isActive ? color : 'transparent'}`,
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.5,
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: isActive ? color : 'var(--text-faint)' }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab bar: global + environments */}
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setSelectedTab('global')}
            className={`pill ${selectedTab === 'global' ? 'active' : ''}`}
          >
            Global
          </button>
          {environments.map((env) => (
            <div key={env.id} className="flex items-center gap-0.5">
              <button
                onClick={() => selectEnv(env.id)}
                className={`pill ${selectedTab === env.id ? 'active' : ''}`}
              >
                {env.name}
              </button>
              <button
                onClick={() => deleteEnv(env.id)}
                className="btn-icon"
                style={{ width: '18px', height: '18px', fontSize: '9px', color: 'var(--danger)' }}
              >✕</button>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEnv(); }}
              placeholder="New env..."
              className="input text-[11px]"
              style={{ padding: '3px 8px', width: '110px' }}
            />
            <button
              onClick={addEnv}
              className="btn-icon"
              style={{ width: '22px', height: '22px', fontSize: '14px', color: 'var(--accent-primary)' }}
            >+</button>
          </div>
        </div>

        {/* Variables table */}
        <div className="space-y-1">
          <div className="flex gap-1 text-[10px] font-semibold uppercase tracking-wider items-center" style={{ color: 'var(--text-faint)' }}>
            <span style={{ width: '4px', flexShrink: 0 }}></span>
            <span style={{ width: '120px', flexShrink: 0 }}>Key</span>
            <span style={{ flex: 1 }}>Value</span>
            <span style={{ width: '26px', flexShrink: 0 }}></span>
            <span style={{ width: '26px', flexShrink: 0 }}></span>
            <span style={{ width: '26px', flexShrink: 0 }}></span>
          </div>

          {envVariables.map((v) => {
            const scopeColor = VARIABLE_SCOPE_COLORS[v.scope] || '#6b7280';
            return (
              <div key={v.id} className="flex gap-1 items-center">
                {/* Scope color bar */}
                <span
                  className="inline-block w-1 rounded-full self-stretch flex-shrink-0"
                  style={{ background: scopeColor, minHeight: '26px' }}
                  title={`${v.scope} scope`}
                />
                <input
                  value={v.key}
                  onChange={(e) => updateVariable(v.id, { key: e.target.value })}
                  placeholder="variable_name"
                  className="input text-[12px]"
                  style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4, width: '120px', flexShrink: 0 }}
                />
                <input
                  value={v.currentValue}
                  onChange={(e) => updateVariable(v.id, { currentValue: e.target.value })}
                  placeholder="value"
                  className="input text-[12px]"
                  style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4, flex: 1 }}
                />
                {/* Scope badge */}
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `${scopeColor}20`, color: scopeColor, width: '26px', textAlign: 'center' }}
                  title={v.scope}
                >
                  {v.scope.charAt(0).toUpperCase()}
                </span>
                {/* Enabled toggle */}
                <button
                  onClick={() => updateVariable(v.id, { enabled: !v.enabled })}
                  className="btn-icon"
                  style={{ width: '26px', height: '26px', fontSize: '11px', color: v.enabled ? 'var(--success)' : 'var(--text-faint)' }}
                >
                  {v.enabled ? '✓' : '○'}
                </button>
                {/* Delete */}
                <button
                  onClick={() => deleteVariable(v.id)}
                  className="btn-icon"
                  style={{ width: '26px', height: '26px', fontSize: '11px', color: 'var(--danger)' }}
                >✕</button>
              </div>
            );
          })}

          {envVariables.length === 0 && (
            <p className="text-[11px] py-2" style={{ color: 'var(--text-faint)' }}>
              {selectedTab === 'global' ? 'No global variables yet.' : 'No variables in this environment yet.'}
            </p>
          )}

          <button
            onClick={addVariable}
            className="text-[11px] font-medium"
            style={{ color: 'var(--text-faint)' }}
          >+ Add Variable</button>
        </div>
      </div>
    </div>
  );
}
