'use client';

import { usePlaygroundStore } from '@/lib/store';
import { METHOD_COLORS, HttpMethod } from '@/lib/types';
import { useState } from 'react';

export default function Sidebar() {
  const {
    sidebarTab, setSidebarTab,
    collections, deleteCollection, loadFromCollection, deleteFromCollection,
    history, clearHistory, loadFromHistory,
  } = usePlaygroundStore();
  const [newColName, setNewColName] = useState('');
  const [adding, setAdding] = useState(false);

  const addCol = () => {
    if (newColName.trim()) {
      collections.length; // trigger
      usePlaygroundStore.getState().addCollection(newColName.trim());
      setNewColName('');
      setAdding(false);
    }
  };

  return (
    <aside
      className="w-64 shrink-0 flex flex-col"
      style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}
    >
      {/* Tab switcher */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['collections', 'history'] as const).map(tab => (
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
        {sidebarTab === 'collections' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Collections</span>
              <button onClick={() => setAdding(true)} className="btn-icon" style={{ width: '22px', height: '22px', fontSize: '14px' }}>+</button>
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
                onDelete={() => deleteCollection(col.id)}
                onLoadReq={(reqId) => loadFromCollection(col.id, reqId)}
                onDeleteReq={(reqId) => deleteFromCollection(col.id, reqId)}
              />
            ))}
          </div>
        )}

        {sidebarTab === 'history' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>History</span>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Clear</button>
              )}
            </div>
            {history.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No requests yet</p>
            )}
            {history.map(entry => (
              <button
                key={entry.id}
                onClick={() => loadFromHistory(entry.id)}
                className="w-full text-left px-2 py-1.5 rounded-md transition-all flex items-center gap-2"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  className="method-badge shrink-0"
                  style={{ background: `${METHOD_COLORS[entry.request.method]}18`, color: METHOD_COLORS[entry.request.method] }}
                >
                  {entry.request.method.slice(0, 3)}
                </span>
                <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                  {entry.request.url || entry.request.name}
                </span>
                <span className="ml-auto text-[10px] shrink-0" style={{ color: entry.response.status >= 200 && entry.response.status < 400 ? 'var(--success)' : 'var(--danger)' }}>
                  {entry.response.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function CollectionItem({ collection, onDelete, onLoadReq, onDeleteReq }: {
  collection: any;
  onDelete: () => void;
  onLoadReq: (id: string) => void;
  onDeleteReq: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1 group">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 text-left px-2 py-1.5 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all"
          style={{ background: 'transparent', color: 'var(--text-primary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{open ? '▼' : '▶'}</span>
          {collection.name}
          <span className="text-[10px] ml-auto" style={{ color: 'var(--text-faint)' }}>{collection.requests.length}</span>
        </button>
        <button onClick={onDelete} className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: '20px', height: '20px', fontSize: '10px', color: 'var(--danger)' }}>✕</button>
      </div>
      {open && collection.requests.map((req: any) => (
        <div key={req.id} className="flex items-center gap-1 ml-4 group/item">
          <button
            onClick={() => onLoadReq(req.id)}
            className="flex-1 text-left px-2 py-1 rounded-md text-[11px] flex items-center gap-1.5 transition-all"
            style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="method-badge" style={{ background: `${METHOD_COLORS[req.method as keyof typeof METHOD_COLORS]}18`, color: METHOD_COLORS[req.method as keyof typeof METHOD_COLORS], fontSize: '8px', padding: '1px 4px' }}>
              {req.method.slice(0, 3)}
            </span>
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{req.name}</span>
          </button>
          <button onClick={() => onDeleteReq(req.id)} className="btn-icon opacity-0 group-hover/item:opacity-100 transition-opacity" style={{ width: '18px', height: '18px', fontSize: '9px', color: 'var(--danger)' }}>✕</button>
        </div>
      ))}
    </div>
  );
}
