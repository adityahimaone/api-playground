'use client';

import { usePlaygroundStore } from '@/lib/store';
import { METHOD_COLORS, HttpMethod, createKVPair } from '@/lib/types';
import { useState, useRef } from 'react';

export default function Sidebar() {
  const {
    sidebarTab, setSidebarTab,
    collections, deleteCollection, loadFromCollection, deleteFromCollection, renameCollection,
    history, clearHistory, loadFromHistory,
    globalVariables, addGlobalVariable, updateGlobalVariable, toggleGlobalVariable, deleteGlobalVariable,
    environments, activeEnvId, setActiveEnvId, addEnvironment, deleteEnvironment, updateEnvironment,
    activeCollectionId, setActiveCollectionId,
    exportCollection, exportAllCollections, importCollection,
  } = usePlaygroundStore();
  const [newColName, setNewColName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [envTab, setEnvTab] = useState<string>('global');
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addCol = () => {
    if (newColName.trim()) {
      usePlaygroundStore.getState().addCollection(newColName.trim());
      setNewColName('');
      setAdding(false);
    }
  };

  const activeEnv = environments.find(e => e.id === activeEnvId);

  // --- Import / Export handlers ---
  const handleExportAll = () => {
    const json = exportAllCollections();
    downloadJson(json, 'api-playground-collections.json');
  };

  const handleExportSingle = (collectionId: string) => {
    const json = exportCollection(collectionId);
    const col = collections.find(c => c.id === collectionId);
    downloadJson(json, `${col?.name || 'collection'}.json`);
  };

  const downloadJson = (json: string, filename: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (importCollection(text)) {
        // success — store already updated
      } else {
        alert('Invalid file format. Expected API Playground export file.');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = '';
  };

  return (
    <aside
      className="w-64 shrink-0 flex flex-col"
      style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}
    >
      {/* Tab switcher */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['collections', 'history', 'variables'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSidebarTab(tab)}
            className="flex-1 text-[11px] font-semibold py-2.5 capitalize transition-all"
            style={{
              background: sidebarTab === tab ? 'var(--bg-card)' : 'transparent',
              color: sidebarTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: sidebarTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">

        {/* ====== COLLECTIONS TAB ====== */}
        {sidebarTab === 'collections' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Collections</span>
              <div className="flex gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', fontSize: '11px' }}
                  title="Import collection"
                >↓</button>
                <button
                  onClick={handleExportAll}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', fontSize: '11px' }}
                  title="Export all collections"
                  disabled={collections.length === 0}
                >↑</button>
                <button onClick={() => setAdding(true)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '14px' }}>+</button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </div>

            {adding && (
              <div className="flex gap-1 mb-2">
                <input
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCol()}
                  placeholder="Collection name..."
                  className="input text-[11px]"
                  style={{ padding: '5px 8px' }}
                  autoFocus
                />
                <button onClick={addCol} className="btn-primary text-[10px] py-1 px-2">OK</button>
              </div>
            )}

            {collections.length === 0 && !adding && (
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No collections yet</p>
            )}

            {collections.map(col => (
              <CollectionItem
                key={col.id}
                collection={col}
                isActive={activeCollectionId === col.id}
                onSelect={() => setActiveCollectionId(activeCollectionId === col.id ? null : col.id)}
                onDelete={() => deleteCollection(col.id)}
                onLoadReq={(reqId) => loadFromCollection(col.id, reqId)}
                onDeleteReq={(reqId) => deleteFromCollection(col.id, reqId)}
                onExport={() => handleExportSingle(col.id)}
                onRename={(newName) => renameCollection(col.id, newName)}
                editingColId={editingColId}
                setEditingColId={setEditingColId}
                editingColName={editingColName}
                setEditingColName={setEditingColName}
              />
            ))}
          </div>
        )}

        {/* ====== HISTORY TAB ====== */}
        {sidebarTab === 'history' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>History</span>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-[10px] font-medium" style={{ color: 'var(--danger)' }}>Clear</button>
              )}
            </div>
            {history.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No history yet</p>
            )}
            {history.map(h => (
              <button
                key={h.id}
                onClick={() => loadFromHistory(h.id)}
                className="w-full text-left p-2 rounded-lg transition-all"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="method-badge"
                    style={{ background: METHOD_COLORS[h.request.method as HttpMethod] + '22', color: METHOD_COLORS[h.request.method as HttpMethod] }}
                  >
                    {h.request.method}
                  </span>
                  <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {h.request.name || 'Untitled'}
                  </span>
                </div>
                <div className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {h.request.url || 'No URL'}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {new Date(h.timestamp).toLocaleTimeString()} · {h.response.status}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ====== VARIABLES TAB ====== */}
        {sidebarTab === 'variables' && (
          <div>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-faint)' }}>
              Use {'{{variable_name}}'} in URL, headers, body, or auth. Scope: Global &lt; Environment &lt; Collection (last wins).
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
                  style={{ color: 'var(--text-faint)' }}>+ Add Variable</button>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// Collection Item sub-component
function CollectionItem({
  collection, isActive, onSelect, onDelete, onLoadReq, onDeleteReq, onExport, onRename,
  editingColId, setEditingColId, editingColName, setEditingColName,
}: {
  collection: { id: string; name: string; requests: any[]; variables: any[] };
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onLoadReq: (reqId: string) => void;
  onDeleteReq: (reqId: string) => void;
  onExport: () => void;
  onRename: (newName: string) => void;
  editingColId: string | null;
  setEditingColId: (id: string | null) => void;
  editingColName: string;
  setEditingColName: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const startRename = () => {
    setEditingColId(collection.id);
    setEditingColName(collection.name);
  };

  const commitRename = () => {
    if (editingColName.trim()) {
      onRename(editingColName.trim());
    }
    setEditingColId(null);
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: isActive ? 'var(--accent-primary-soft)' : 'transparent',
        border: isActive ? '1px solid var(--accent-primary)' : '1px solid transparent',
      }}
    >
      <div
        className="flex items-center justify-between p-2 cursor-pointer"
        onClick={() => { onSelect(); setExpanded(!expanded); }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {collection.name}
          </span>
          {collection.variables.length > 0 && (
            <span
              className="text-[9px] px-1 rounded-full"
              style={{ background: 'var(--info)', color: '#fff' }}
            >
              {collection.variables.length}
            </span>
          )}
        </div>
        <div className="flex gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onExport(); }}
            className="btn-icon"
            style={{ width: '20px', height: '20px', fontSize: '10px' }}
            title="Export collection"
          >↑</button>
          <button
            onClick={(e) => { e.stopPropagation(); startRename(); }}
            className="btn-icon"
            style={{ width: '20px', height: '20px', fontSize: '10px' }}
            title="Rename"
          >✎</button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="btn-icon"
            style={{ width: '20px', height: '20px', fontSize: '10px', color: 'var(--danger)' }}
            title="Delete"
          >✕</button>
        </div>
      </div>

      {editingColId === collection.id && (
        <div className="px-2 pb-2">
          <input
            value={editingColName}
            onChange={e => setEditingColName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitRename()}
            onBlur={commitRename}
            className="input text-[11px]"
            style={{ padding: '4px 8px' }}
            autoFocus
          />
        </div>
      )}

      {expanded && editingColId !== collection.id && (
        <div className="px-2 pb-2 space-y-0.5">
          {collection.requests.length === 0 && (
            <p className="text-[10px] py-1" style={{ color: 'var(--text-faint)' }}>No requests</p>
          )}
          {collection.requests.map((req: any) => (
            <div key={req.id} className="flex items-center gap-1 group">
              <button
                onClick={() => onLoadReq(req.id)}
                className="flex-1 text-left flex items-center gap-1 py-1 px-1.5 rounded transition-all"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  className="method-badge"
                  style={{
                    background: METHOD_COLORS[req.method as HttpMethod] + '22',
                    color: METHOD_COLORS[req.method as HttpMethod],
                    fontSize: '8px',
                    padding: '1px 4px',
                  }}
                >
                  {req.method}
                </span>
                <span className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                  {req.name || 'Untitled'}
                </span>
              </button>
              <button
                onClick={() => onDeleteReq(req.id)}
                className="btn-icon opacity-0 group-hover:opacity-100"
                style={{ width: '18px', height: '18px', fontSize: '8px', color: 'var(--danger)' }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
