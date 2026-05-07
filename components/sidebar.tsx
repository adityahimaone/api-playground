'use client';

import { useCollectionStore } from '@/lib/stores';
import { useRequestStore } from '@/lib/stores';
import { useUIStore } from '@/lib/stores';
import { useHistoryStore } from '@/lib/stores';
import {
  METHOD_COLORS,
  HttpMethod,
  TreeNode,
  createRequestEntity,
  createEnvironment,
  VariableEntity,
  createVariableEntity,
  Environment,
  VariableScope,
} from '@/lib/entities';
import { importPostmanCollection } from '@/lib/services/import-postman.service';
import { exportToPostman } from '@/lib/services/export-postman.service';
import { useState, useRef, useEffect, useCallback } from 'react';
import { nodeRepository } from '@/lib/repositories/node.repository';
import { requestRepository } from '@/lib/repositories/request.repository';
import { responseRepository } from '@/lib/repositories/response.repository';
import { environmentRepository } from '@/lib/repositories/environment.repository';
import { variableRepository } from '@/lib/repositories/variable.repository';
import { historyRepository } from '@/lib/repositories/history.repository';

export default function Sidebar() {
  const {
    treeNodes, rootIds, getNodeChildren, createNode, deleteNode, renameNode,
  } = useCollectionStore();
  const {
    requests, getRequest, createRequest, deleteRequest, updateRequest,
    getResponses, responses: responsesMap,
  } = useRequestStore();
  const {
    sidebarTab, setSidebarTab,
    searchQuery, setSearchQuery,
    expandedNodeIds, toggleExpanded,
    contextMenu, showContextMenu, hideContextMenu,
    openTab, activeTabId, closeTab,
  } = useUIStore();
  const { entries: historyEntries, clearHistory, loadEntries } = useHistoryStore();

  // Local state for environment management
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [selectedEnvTab, setSelectedEnvTab] = useState<string>('global');
  const [newEnvName, setNewEnvName] = useState('');
  const [envVariables, setEnvVariables] = useState<VariableEntity[]>([]);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

  // Editing state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeName, setEditingNodeName] = useState('');
  const [addingCollection, setAddingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load environments from Dexie on mount
  useEffect(() => {
    environmentRepository.getAll().then((envs) => {
      setEnvironments(envs);
      const active = envs.find((e) => e.isActive);
      if (active) setActiveEnvId(active.id);
    });
  }, []);

  // Load variables when selectedEnvTab changes
  useEffect(() => {
    const loadVariables = async () => {
      if (selectedEnvTab === 'global') {
        const vars = await variableRepository.getByScope('global');
        setEnvVariables(vars);
      } else if (selectedEnvTab.startsWith('collection:')) {
        const collId = selectedEnvTab.slice('collection:'.length);
        const vars = await variableRepository.getByScope('collection', collId);
        setEnvVariables(vars);
      } else {
        const vars = await variableRepository.getByScope('environment', selectedEnvTab);
        setEnvVariables(vars);
      }
    };
    loadVariables();
  }, [selectedEnvTab, environments, treeNodes]);

  // Load history from Dexie on mount
  useEffect(() => {
    historyRepository.getAll().then((entries) => {
      loadEntries(entries);
    });
  }, []);

  // Close context menu on click anywhere
  useEffect(() => {
    const handler = () => hideContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu.visible, hideContextMenu]);

  // Close context menu on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [hideContextMenu]);

  // ═══ Collection CRUD ═══
  const handleAddCollection = () => {
    if (newCollectionName.trim()) {
      const req = createRequest('Collection Root');
      const node = createNode('collection', newCollectionName.trim(), null);
      setNewCollectionName('');
      setAddingCollection(false);
    }
  };

  // ═══ Context Menu Actions ═══
  const ctxAddFolder = () => {
    const { nodeType, nodeId } = contextMenu;
    const parentId = nodeType === 'folder' ? nodeId : nodeType === 'request' ? null : null;
    // For request nodes, find parent
    let targetParent = parentId;
    if (nodeType === 'request') {
      const node = treeNodes[nodeId];
      targetParent = node?.parentId ?? null;
    }
    const name = prompt('Folder name:');
    if (name?.trim()) {
      createNode('folder', name.trim(), targetParent);
    }
    hideContextMenu();
  };

  const ctxAddRequest = () => {
    const { nodeType, nodeId } = contextMenu;
    let targetParent = null;
    if (nodeType === 'folder') {
      targetParent = nodeId;
    } else if (nodeType === 'request') {
      const node = treeNodes[nodeId];
      targetParent = node?.parentId ?? null;
    } else if (nodeType === 'collection') {
      targetParent = nodeId;
    }
    const req = createRequest('New Request');
    const node = createNode('request', 'New Request', targetParent);
    // Link request to tree node
    node.dataId = req.id;
    useCollectionStore.getState().treeNodes[node.id] = {
      ...useCollectionStore.getState().treeNodes[node.id],
      dataId: req.id,
    };
    hideContextMenu();
  };

  const ctxRename = () => {
    const { nodeId } = contextMenu;
    const node = treeNodes[nodeId];
    if (node) {
      setEditingNodeId(nodeId);
      setEditingNodeName(node.name);
    }
    hideContextMenu();
  };

  const ctxDuplicate = () => {
    const { nodeType, nodeId } = contextMenu;
    if (nodeType === 'request') {
      const node = treeNodes[nodeId];
      if (node?.dataId) {
        const originalReq = getRequest(node.dataId);
        if (originalReq) {
          const newReq = { ...originalReq, id: Math.random().toString(36).slice(2, 10), name: originalReq.name + ' (Copy)', createdAt: Date.now(), updatedAt: Date.now() };
          useRequestStore.setState((state) => ({
            requests: { ...state.requests, [newReq.id]: newReq },
          }));
          const newNode = createNode('request', newReq.name, node.parentId);
          newNode.dataId = newReq.id;
        }
      }
    }
    hideContextMenu();
  };

  const ctxDelete = () => {
    const { nodeType, nodeId } = contextMenu;
    if (nodeType === 'request') {
      const node = treeNodes[nodeId];
      if (node?.dataId) {
        deleteRequest(node.dataId);
      }
    }
    deleteNode(nodeId);
    hideContextMenu();
  };

  // ═══ Import/Export ═══
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const result = importPostmanCollection(text);
        if (result.errors.length > 0) {
          alert('Import errors: ' + result.errors.join(', '));
          return;
        }

        // Load tree nodes into collection store
        useCollectionStore.getState().loadTree(result.treeNodes);

        // Load requests into request store
        useRequestStore.setState((state) => {
          const newRequests = { ...state.requests };
          for (const req of result.requests) {
            newRequests[req.id] = req;
          }
          return { requests: newRequests };
        });

        // Load responses
        for (const resp of result.responses) {
          useRequestStore.getState().addResponse(resp);
        }

        // Persist to Dexie
        nodeRepository.bulkCreate(result.treeNodes).catch(console.error);
        requestRepository.bulkCreate(result.requests).catch(console.error);
        responseRepository.bulkCreate(result.responses).catch(console.error);
      } catch (err: any) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const allNodes = Object.values(treeNodes);
    const allRequests = Object.values(requests);
    const allResponses = Object.values(responsesMap).flat();
    const json = exportToPostman(allNodes, allRequests, allResponses);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-playground-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ═══ Context Menu Handler ═══
  const handleContextMenu = (e: React.MouseEvent, nodeType: 'collection' | 'folder' | 'request', nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu({ x: e.clientX, y: e.clientY, nodeType, nodeId });
  };

  // ═══ Rename Commit ═══
  const commitRename = () => {
    if (editingNodeId && editingNodeName.trim()) {
      renameNode(editingNodeId, editingNodeName.trim());
    }
    setEditingNodeId(null);
  };

  // ═══ Environment CRUD ═══
  const addEnv = async () => {
    if (newEnvName.trim()) {
      const env = createEnvironment(newEnvName.trim());
      await environmentRepository.create(env);
      setEnvironments((prev) => [...prev, env]);
      setNewEnvName('');
    }
  };

  const deleteEnv = async (id: string) => {
    await variableRepository.deleteByScopeId(id);
    await environmentRepository.delete(id);
    setEnvironments((prev) => prev.filter((e) => e.id !== id));
    if (activeEnvId === id) setActiveEnvId(null);
  };

  const notifyVariablesChanged = () => document.dispatchEvent(new CustomEvent('variables:changed'));

  const addVariable = async () => {
    let scope: VariableScope = 'global';
    let scopeId: string | undefined = undefined;
    if (selectedEnvTab === 'global') {
      scope = 'global';
    } else if (selectedEnvTab.startsWith('collection:')) {
      scope = 'collection';
      scopeId = selectedEnvTab.slice('collection:'.length);
    } else {
      scope = 'environment';
      scopeId = selectedEnvTab;
    }
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

  const toggleSecretReveal = (varId: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(varId)) next.delete(varId);
      else next.add(varId);
      return next;
    });
  };

  const activeEnv = environments.find((e) => e.id === activeEnvId);

  // Helper to get tab label
  const getTabLabel = () => {
    if (selectedEnvTab === 'global') return 'Global';
    if (selectedEnvTab.startsWith('collection:')) {
      const collId = selectedEnvTab.slice('collection:'.length);
      return treeNodes[collId]?.name || 'Collection';
    }
    const env = environments.find(e => e.id === selectedEnvTab);
    return env?.name || selectedEnvTab;
  };

  // ═══ Render ═══
  return (
    <aside
      className="w-64 shrink-0 flex flex-col"
      style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}
    >
      {/* ═══ TOP SECTION ═══ */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            Collections
          </span>
          <div className="flex gap-0.5">
            <button
              onClick={() => setAddingCollection(true)}
              className="btn-icon"
              style={{ width: '22px', height: '22px', fontSize: '14px' }}
              title="New Collection"
            >
              +
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-icon"
              style={{ width: '22px', height: '22px', fontSize: '11px' }}
              title="Import Postman Collection"
            >
              ↑
            </button>
            <button
              onClick={handleExport}
              className="btn-icon"
              style={{ width: '22px', height: '22px', fontSize: '11px' }}
              title="Export to Postman"
            >
              ↓
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
        {addingCollection && (
          <div className="flex gap-1 mt-2">
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCollection()}
              placeholder="Collection name..."
              className="input text-[11px]"
              style={{ padding: '5px 8px' }}
              autoFocus
            />
            <button onClick={handleAddCollection} className="btn-primary text-[10px] py-1 px-2">OK</button>
          </div>
        )}
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['collections', 'history', 'variables'] as const).map((tab) => (
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
        {/* ═══ COLLECTIONS TAB ═══ */}
        {sidebarTab === 'collections' && (
          <div className="space-y-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search requests..."
              className="input text-[11px] w-full"
              style={{ padding: '5px 8px' }}
            />
            <div className="space-y-1">
              {getNodeChildren(null).map((node) => (
                <CollectionNode
                  key={node.id}
                  node={node}
                  depth={0}
                  searchQuery={searchQuery}
                  onContextMenu={handleContextMenu}
                />
              ))}
              {getNodeChildren(null).length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  No collections yet. Click + to create one.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {sidebarTab === 'history' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                History
              </span>
              {historyEntries.length > 0 && (
                <button
                  onClick={() => { clearHistory(); historyRepository.clearAll(); }}
                  className="text-[10px] font-medium"
                  style={{ color: 'var(--danger)' }}
                >
                  Clear
                </button>
              )}
            </div>
            {historyEntries.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No history yet</p>
            )}
            {historyEntries.map((h) => (
              <button
                key={h.id}
                className="w-full text-left p-2 rounded-lg transition-all"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[9px] font-bold px-1 py-0.5 rounded"
                    style={{
                      background: (METHOD_COLORS[h.method] || '#666') + '22',
                      color: METHOD_COLORS[h.method] || '#666',
                    }}
                  >
                    {h.method}
                  </span>
                  <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {h.url || 'Untitled'}
                  </span>
                </div>
                <div className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {h.url || 'No URL'}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {new Date(h.timestamp).toLocaleTimeString()} · {h.status}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ═══ VARIABLES TAB ═══ */}
        {sidebarTab === 'variables' && (
          <div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
              Use {'{{variable_name}}'} in URL, headers, body, or auth. Scope: Global &lt; Environment &lt; Collection (last wins).
            </p>

            {/* ── Global tab ── */}
            <div className="mb-3">
              <button
                onClick={() => setSelectedEnvTab('global')}
                className={`pill ${selectedEnvTab === 'global' ? 'active' : ''}`}
              >
                Global
              </button>
            </div>

            {/* ── Environment section ── */}
            {environments.length > 0 && (
              <div className="mb-3">
                <span className="text-[9px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-faint)' }}>
                  Environments
                </span>
                <div className="flex gap-1 flex-wrap">
                  {environments.map((env) => (
                    <div key={env.id} className="flex items-center gap-0.5">
                      <button
                        onClick={() => { setSelectedEnvTab(env.id); setActiveEnvId(env.id); useUIStore.setState({ activeEnvId: env.id }); notifyVariablesChanged(); }}
                        className={`pill ${selectedEnvTab === env.id ? 'active' : ''}`}
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
                      style={{ padding: '3px 8px', width: '100px' }}
                    />
                    <button
                      onClick={addEnv}
                      className="btn-icon"
                      style={{ width: '22px', height: '22px', fontSize: '14px', color: 'var(--accent-primary)' }}
                    >+</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Collection section ── */}
            {(() => {
              const collections = getNodeChildren(null).filter(n => n.type === 'collection');
              if (collections.length === 0) return null;
              return (
                <div className="mb-3">
                  <span className="text-[9px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-faint)' }}>
                    Collections
                  </span>
                  <div className="flex gap-1 flex-wrap">
                    {collections.map((coll) => (
                      <button
                        key={coll.id}
                        onClick={() => setSelectedEnvTab('collection:' + coll.id)}
                        className={`pill ${selectedEnvTab === 'collection:' + coll.id ? 'active' : ''}`}
                      >
                        {coll.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Variables Table ── */}
            <div className="space-y-1">
              <div className="flex gap-1 text-[10px] font-semibold uppercase tracking-wider items-center" style={{ color: 'var(--text-faint)' }}>
                <span style={{ width: '80px', flexShrink: 0 }}>Key</span>
                <span style={{ width: '70px', flexShrink: 0 }}>Initial</span>
                <span style={{ flex: 1 }}>Current</span>
                <span style={{ width: '22px', flexShrink: 0 }}></span>
                <span style={{ width: '22px', flexShrink: 0 }}></span>
                <span style={{ width: '22px', flexShrink: 0 }}></span>
              </div>
              {envVariables.map((v) => (
                <div key={v.id} className="flex gap-1 items-center">
                  <input
                    value={v.key}
                    onChange={(e) => updateVariable(v.id, { key: e.target.value })}
                    placeholder="variable_name"
                    className="input text-[12px]"
                    style={{ padding: '5px 6px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4, width: '80px', flexShrink: 0 }}
                  />
                  <input
                    value={v.initialValue}
                    onChange={(e) => updateVariable(v.id, { initialValue: e.target.value })}
                    placeholder="initial"
                    className="input text-[12px]"
                    style={{ padding: '5px 6px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 0.6 : 0.35, width: '70px', flexShrink: 0 }}
                  />
                  <div className="flex items-center flex-1 min-w-0">
                    {v.secret && !revealedSecrets.has(v.id) ? (
                      <input
                        value="********"
                        readOnly
                        className="input text-[12px]"
                        style={{ padding: '5px 6px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4, flex: 1 }}
                      />
                    ) : (
                      <input
                        value={v.currentValue}
                        onChange={(e) => updateVariable(v.id, { currentValue: e.target.value })}
                        placeholder="value"
                        className="input text-[12px]"
                        style={{ padding: '5px 6px', fontFamily: 'var(--font-mono)', opacity: v.enabled ? 1 : 0.4, flex: 1 }}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => updateVariable(v.id, { secret: !v.secret })}
                    className="btn-icon"
                    style={{ width: '22px', height: '22px', fontSize: '10px', color: v.secret ? 'var(--warning)' : 'var(--text-faint)' }}
                    title={v.secret ? 'Mark as not secret' : 'Mark as secret'}
                  >
                    {v.secret ? '🔒' : '🔓'}
                  </button>
                  {v.secret && (
                    <button
                      onClick={() => toggleSecretReveal(v.id)}
                      className="btn-icon"
                      style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--text-muted)' }}
                      title={revealedSecrets.has(v.id) ? 'Hide value' : 'Reveal value'}
                    >
                      {revealedSecrets.has(v.id) ? '👁‍🗨' : '👁'}
                    </button>
                  )}
                  {!v.secret && <span style={{ width: '22px', flexShrink: 0 }}></span>}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => updateVariable(v.id, { enabled: !v.enabled })}
                      className="btn-icon"
                      style={{ width: '22px', height: '22px', fontSize: '10px', color: v.enabled ? 'var(--success)' : 'var(--text-faint)' }}
                    >
                      {v.enabled ? '✓' : '○'}
                    </button>
                    <button
                      onClick={() => deleteVariable(v.id)}
                      className="btn-icon"
                      style={{ width: '22px', height: '22px', fontSize: '10px', color: 'var(--danger)' }}
                    >✕</button>
                  </div>
                </div>
              ))}
              {envVariables.length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {selectedEnvTab === 'global'
                    ? 'No global variables yet.'
                    : selectedEnvTab.startsWith('collection:')
                      ? 'No variables in this collection yet.'
                      : 'No variables in this environment yet.'}
                </p>
              )}
              <button
                onClick={addVariable}
                className="text-[11px] font-medium"
                style={{ color: 'var(--text-faint)' }}
              >
                + Add Variable
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ CONTEXT MENU ═══ */}
      {contextMenu.visible && (
        <div
          className="fixed z-[100] rounded-lg overflow-hidden"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: '160px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.nodeType !== 'collection' && (
            <>
              <ContextMenuItem icon="📁" label="Add Folder" onClick={ctxAddFolder} />
              <ContextMenuItem icon="📎" label="Add Request" onClick={ctxAddRequest} />
              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
            </>
          )}
          {contextMenu.nodeType === 'request' && (
            <>
              <ContextMenuItem icon="📋" label="Duplicate" onClick={ctxDuplicate} />
              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
            </>
          )}
          <ContextMenuItem icon="✏️" label="Rename" onClick={ctxRename} />
          <ContextMenuItem icon="🗑️" label="Delete" onClick={ctxDelete} danger />
        </div>
      )}
    </aside>
  );
}

// ═══ Context Menu Item ═══
function ContextMenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 flex items-center gap-2 text-[12px] transition-all"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: danger ? 'var(--danger)' : 'var(--text-secondary)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ═══ Collection Node (root-level) ═══
function CollectionNode({
  node,
  depth,
  searchQuery,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  searchQuery: string;
  onContextMenu: (e: React.MouseEvent, t: 'collection' | 'folder' | 'request', id: string) => void;
}) {
  const { treeNodes, getNodeChildren, renameNode } = useCollectionStore();
  const { requests, getRequest, deleteRequest } = useRequestStore();
  const { expandedNodeIds, toggleExpanded, openTab, activeTabId } = useUIStore();
  const { deleteNode } = useCollectionStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const isExpanded = expandedNodeIds.includes(node.id);
  const children = getNodeChildren(node.id);

  // Search filter: for request nodes, check if name/URL matches
  if (searchQuery.trim() && node.type === 'request' && node.dataId) {
    const req = getRequest(node.dataId);
    const q = searchQuery.toLowerCase();
    if (req) {
      const match = req.name.toLowerCase().includes(q) || req.url.toLowerCase().includes(q) || req.method.toLowerCase().includes(q);
      if (!match) return null;
    }
  }

  const startRename = () => {
    setEditingId(node.id);
    setEditingName(node.name);
  };

  const commitRename = () => {
    if (editingName.trim()) {
      renameNode(editingId!, editingName.trim());
    }
    setEditingId(null);
  };

  const handleClick = () => {
    if (node.type === 'collection' || node.type === 'folder') {
      toggleExpanded(node.id);
    } else if (node.type === 'request' && node.dataId) {
      openTab(node.dataId);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'request' && node.dataId) {
      deleteRequest(node.dataId);
    }
    deleteNode(node.id);
  };

  if (node.type === 'collection') {
    return (
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: isExpanded ? 'var(--accent-primary-soft)' : 'transparent',
          border: isExpanded ? '1px solid var(--accent-primary)' : '1px solid transparent',
        }}
      >
        <div
          className="flex items-center justify-between p-2 cursor-pointer"
          onClick={handleClick}
          onContextMenu={(e) => onContextMenu(e, 'collection', node.id)}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span style={{ fontSize: '9px', color: 'var(--text-faint)' }}>{isExpanded ? '▾' : '▸'}</span>
            <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {node.name}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); startRename(); }}
            className="btn-icon"
            style={{ width: '20px', height: '20px', fontSize: '10px' }}
          >
            ✎
          </button>
        </div>
        {editingId === node.id && (
          <div className="px-2 pb-2">
            <input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              onBlur={commitRename}
              className="input text-[11px]"
              style={{ padding: '4px 8px' }}
              autoFocus
            />
          </div>
        )}
        {isExpanded && editingId !== node.id && (
          <div className="px-2 pb-2 space-y-0.5">
            {children.length === 0 && (
              <p className="text-[10px] py-1" style={{ color: 'var(--text-faint)' }}>Empty collection</p>
            )}
            {children.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                depth={1}
                searchQuery={searchQuery}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback — shouldn't happen at root level
  return null;
}

// ═══ Tree Node Item (recursive) ═══
function TreeNodeItem({
  node,
  depth,
  searchQuery,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  searchQuery: string;
  onContextMenu: (e: React.MouseEvent, t: 'collection' | 'folder' | 'request', id: string) => void;
}) {
  const { treeNodes, getNodeChildren, renameNode, deleteNode } = useCollectionStore();
  const { requests, getRequest, deleteRequest } = useRequestStore();
  const { expandedNodeIds, toggleExpanded, openTab, activeTabId } = useUIStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const isExpanded = expandedNodeIds.includes(node.id);
  const children = node.type === 'folder' ? getNodeChildren(node.id) : [];

  // Search filter
  if (searchQuery.trim() && node.type === 'request' && node.dataId) {
    const req = getRequest(node.dataId);
    const q = searchQuery.toLowerCase();
    if (req) {
      const match = req.name.toLowerCase().includes(q) || req.url.toLowerCase().includes(q) || req.method.toLowerCase().includes(q);
      if (!match) return null;
    }
  }

  const startRename = () => {
    setEditingId(node.id);
    setEditingName(node.name);
  };

  const commitRename = () => {
    if (editingName.trim()) {
      renameNode(editingId!, editingName.trim());
    }
    setEditingId(null);
  };

  const handleClick = () => {
    if (node.type === 'folder') {
      toggleExpanded(node.id);
    } else if (node.type === 'request' && node.dataId) {
      openTab(node.dataId);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'request' && node.dataId) {
      deleteRequest(node.dataId);
    }
    deleteNode(node.id);
  };

  // Request node
  if (node.type === 'request' && node.dataId) {
    const req = getRequest(node.dataId);
    if (!req) return null;

    return (
      <div
        className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer group"
        style={{
          paddingLeft: `${(depth) * 12 + 6}px`,
          background: activeTabId && useUIStore.getState().tabs.find((t) => t.requestId === node.dataId && t.id === activeTabId) ? 'var(--accent-primary-soft)' : 'transparent',
        }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, 'request', node.id)}
      >
        <span
          className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
          style={{
            background: (METHOD_COLORS[req.method] || '#666') + '22',
            color: METHOD_COLORS[req.method] || '#666',
          }}
        >
          {req.method}
        </span>
        {editingId === node.id ? (
          <input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            onBlur={commitRename}
            className="input text-[11px] flex-1"
            style={{ padding: '2px 4px' }}
            autoFocus
          />
        ) : (
          <span className="text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>
            {node.name}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(e); }}
          className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ width: '16px', height: '16px', fontSize: '9px', color: 'var(--danger)' }}
        >
          ✕
        </button>
      </div>
    );
  }

  // Folder node
  if (node.type === 'folder') {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer group"
          style={{ paddingLeft: `${(depth) * 12 + 6}px` }}
          onClick={handleClick}
          onContextMenu={(e) => onContextMenu(e, 'folder', node.id)}
        >
          <span style={{ fontSize: '9px', color: 'var(--text-faint)' }}>
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {node.name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); startRename(); }}
            className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ width: '16px', height: '16px', fontSize: '9px' }}
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(e); }}
            className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ width: '16px', height: '16px', fontSize: '9px', color: 'var(--danger)' }}
          >
            ✕
          </button>
        </div>
        {editingId === node.id && (
          <div style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }} className="pb-1">
            <input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              onBlur={commitRename}
              className="input text-[11px]"
              style={{ padding: '3px 6px' }}
              autoFocus
            />
          </div>
        )}
        {isExpanded && editingId !== node.id && (
          <div className="space-y-0.5">
            {children.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                searchQuery={searchQuery}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
