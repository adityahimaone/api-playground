'use client';

import { usePlaygroundStore } from '@/lib/store';
import { useState } from 'react';

export default function SaveToCollectionModal({ onClose }: { onClose: () => void }) {
  const { collections, saveToCollection, addCollection, activeRequest } = usePlaygroundStore();
  const [selectedCol, setSelectedCol] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (creating && newName.trim()) {
      usePlaygroundStore.getState().addCollection(newName.trim());
      const newCols = usePlaygroundStore.getState().collections;
      const newCol = newCols[newCols.length - 1];
      if (newCol) {
        saveToCollection(newCol.id);
        setSaved(true);
        setTimeout(() => { onClose(); }, 800);
      }
    } else if (selectedCol) {
      saveToCollection(selectedCol);
      setSaved(true);
      setTimeout(() => { onClose(); }, 800);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card w-full max-w-sm" style={{ padding: '24px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Save Request</h2>
          <button onClick={onClose} className="btn-icon" style={{ width: '28px', height: '28px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {saved ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">✓</div>
            <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>Saved!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-faint)' }}>
                Request Name
              </label>
              <input
                value={activeRequest.name}
                readOnly
                className="input text-[12px]"
                style={{ padding: '6px 10px', background: 'var(--bg-hover)' }}
              />
            </div>

            {!creating ? (
              <>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-faint)' }}>
                    Collection
                  </label>
                  <select
                    value={selectedCol}
                    onChange={e => setSelectedCol(e.target.value)}
                    className="input text-[12px]"
                    style={{ padding: '6px 10px', cursor: 'pointer' }}
                  >
                    <option value="">Select collection...</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => setCreating(true)} className="text-[11px]" style={{ color: 'var(--accent-orange)' }}>
                  + Create new collection
                </button>
              </>
            ) : (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-faint)' }}>
                  New Collection Name
                </label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="My API Collection"
                  className="input text-[12px]"
                  style={{ padding: '6px 10px' }}
                  autoFocus
                />
                <button onClick={() => setCreating(false)} className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
                  ← Back to existing
                </button>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={(!creating && !selectedCol) || (creating && !newName.trim())}
              className="btn-primary w-full mt-2"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
