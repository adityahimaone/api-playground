'use client';

import { useCollectionStore } from '@/lib/stores';
import { useRequestStore } from '@/lib/stores';
import { useUIStore } from '@/lib/stores';
import { createKVPair, createRequestEntity } from '@/lib/entities';
import { nodeRepository } from '@/lib/repositories/node.repository';
import { requestRepository } from '@/lib/repositories/request.repository';
import { useState } from 'react';

export default function SaveToCollectionModal({ onClose }: { onClose: () => void }) {
  const { treeNodes, rootIds, getNodeChildren, createNode } = useCollectionStore();
  const { getRequest, createRequest } = useRequestStore();
  const { tabs, activeTabId, saveDraft } = useUIStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);

  // Get collections (root nodes of type 'collection')
  const collections = rootIds
    .map((id) => treeNodes[id])
    .filter((n) => n && n.type === 'collection');

  const handleSave = async () => {
    if (!activeTab) return;

    // Save draft first
    saveDraft(activeTab.id);
    const updatedRequest = getRequest(activeTab.requestId);

    if (!updatedRequest) return;

    let targetCollectionId = selectedCollectionId;

    // Create new collection if needed
    if (creating && newCollectionName.trim()) {
      const newNode = createNode('collection', newCollectionName.trim(), null);
      targetCollectionId = newNode.id;
      // Persist
      await nodeRepository.create(newNode).catch(console.error);
    }

    if (!targetCollectionId) return;

    // Find or create request node in the collection
    const existingNode = Object.values(treeNodes).find(
      (n) => n.type === 'request' && n.dataId === activeTab.requestId
    );

    if (!existingNode) {
      // Create a request tree node in the selected collection
      const newNode = createNode('request', updatedRequest.name, targetCollectionId);
      newNode.dataId = activeTab.requestId;
      // Update the node in store
      useCollectionStore.setState((state) => ({
        treeNodes: {
          ...state.treeNodes,
          [newNode.id]: { ...state.treeNodes[newNode.id], dataId: activeTab.requestId },
        },
      }));
      await nodeRepository.create({ ...newNode, dataId: activeTab.requestId }).catch(console.error);
    }

    // Persist the updated request
    await requestRepository.update(updatedRequest.id, updatedRequest).catch(console.error);

    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
            {!activeTab && (
              <p className="text-[11px]" style={{ color: 'var(--warning)' }}>
                No active request to save.
              </p>
            )}

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-faint)' }}>
                Request Name
              </label>
              <input
                value={activeTab ? (getRequest(activeTab.requestId)?.name || '') : ''}
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
                    value={selectedCollectionId}
                    onChange={(e) => setSelectedCollectionId(e.target.value)}
                    className="input text-[12px]"
                    style={{ padding: '6px 10px', cursor: 'pointer' }}
                  >
                    <option value="">Select collection...</option>
                    {collections.map((c) => (
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
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
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
              disabled={(!creating && !selectedCollectionId) || (creating && !newCollectionName.trim()) || !activeTab}
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
