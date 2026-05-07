import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ApiRequest, ApiResponse, Collection, Environment, HistoryEntry,
  createRequest, createKVPair, KVPair
} from './types';

interface PlaygroundStore {
  // Active request
  activeRequest: ApiRequest;
  response: ApiResponse | null;
  loading: boolean;

  // Collections
  collections: Collection[];

  // History
  history: HistoryEntry[];

  // Environments
  environments: Environment[];
  activeEnvId: string | null;

  // Global variables
  globalVariables: KVPair[];

  // UI state
  sidebarTab: 'collections' | 'history' | 'variables';
  activeResponseTab: 'body' | 'headers' | 'meta';

  // Actions
  updateRequest: (req: Partial<ApiRequest>) => void;
  setActiveRequest: (req: ApiRequest) => void;
  setResponse: (res: ApiResponse | null) => void;
  setLoading: (l: boolean) => void;
  sendRequest: () => Promise<void>;

  // Collection actions
  addCollection: (name: string) => void;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  saveToCollection: (collectionId: string) => void;
  loadFromCollection: (collectionId: string, requestId: string) => void;
  deleteFromCollection: (collectionId: string, requestId: string) => void;

  // Per-collection variables
  setCollectionVariables: (collectionId: string, vars: KVPair[]) => void;
  addCollectionVariable: (collectionId: string) => void;
  updateCollectionVariable: (collectionId: string, varId: string, field: 'key' | 'value', val: string) => void;
  toggleCollectionVariable: (collectionId: string, varId: string) => void;
  deleteCollectionVariable: (collectionId: string, varId: string) => void;
  activeCollectionId: string | null;
  setActiveCollectionId: (id: string | null) => void;

  // History
  clearHistory: () => void;
  loadFromHistory: (id: string) => void;

  // Environment actions
  addEnvironment: (name: string) => void;
  deleteEnvironment: (id: string) => void;
  updateEnvironment: (id: string, env: Partial<Environment>) => void;
  setActiveEnvId: (id: string | null) => void;

  // Global variables
  setGlobalVariables: (vars: KVPair[]) => void;
  addGlobalVariable: () => void;
  updateGlobalVariable: (id: string, field: 'key' | 'value', val: string) => void;
  toggleGlobalVariable: (id: string) => void;
  deleteGlobalVariable: (id: string) => void;

  // UI
  setSidebarTab: (tab: 'collections' | 'history' | 'variables') => void;
  setActiveResponseTab: (tab: 'body' | 'headers' | 'meta') => void;

  // Variable resolution (scoping: Global > Env > Collection)
  resolveVariables: (text: string) => string;
  getActiveVariables: () => KVPair[];

  // Import / Export
  exportCollection: (collectionId: string) => string;
  exportAllCollections: () => string;
  importCollection: (json: string) => boolean;
}

const genId = () => Math.random().toString(36).slice(2, 10);

export const usePlaygroundStore = create<PlaygroundStore>()(
  persist(
    (set, get) => ({
      activeRequest: createRequest(),
      response: null,
      loading: false,
      collections: [],
      history: [],
      environments: [],
      activeEnvId: null,
      globalVariables: [],
      activeCollectionId: null,
      sidebarTab: 'collections',
      activeResponseTab: 'body',

      updateRequest: (req) => set((s) => ({ activeRequest: { ...s.activeRequest, ...req } })),
      setActiveRequest: (req) => set({ activeRequest: req, response: null }),
      setResponse: (res) => set({ response: res }),
      setLoading: (l) => set({ loading: l }),

      sendRequest: async () => {
        const { activeRequest, resolveVariables } = get();
        set({ loading: true, response: null });
        try {
          const resolvedUrl = resolveVariables(activeRequest.url);
          const enabledParams = activeRequest.params.filter(p => p.enabled && p.key);
          let fullUrl = resolvedUrl;
          if (enabledParams.length > 0) {
            const qs = new URLSearchParams(
              enabledParams.map(p => [resolveVariables(p.key), resolveVariables(p.value)])
            ).toString();
            fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
          }

          const headers: Record<string, string> = {};
          activeRequest.headers.filter(h => h.enabled && h.key).forEach(h => {
            headers[resolveVariables(h.key)] = resolveVariables(h.value);
          });

          if (activeRequest.auth.type === 'bearer' && activeRequest.auth.token) {
            headers['Authorization'] = `Bearer ${resolveVariables(activeRequest.auth.token)}`;
          } else if (activeRequest.auth.type === 'basic' && activeRequest.auth.username) {
            headers['Authorization'] = `Basic ${btoa(`${resolveVariables(activeRequest.auth.username)}:${resolveVariables(activeRequest.auth.password)}`)}`;
          }

          let body: string | undefined;
          if (activeRequest.method !== 'GET' && activeRequest.method !== 'HEAD') {
            if (activeRequest.bodyType === 'json' || activeRequest.bodyType === 'raw') {
              body = resolveVariables(activeRequest.body);
              if (activeRequest.bodyType === 'json' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
              }
            } else if (activeRequest.bodyType === 'x-www-form-urlencoded') {
              const fd = new URLSearchParams(
                activeRequest.formData.filter(f => f.enabled && f.key).map(f => [resolveVariables(f.key), resolveVariables(f.value)])
              );
              body = fd.toString();
              headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else if (activeRequest.bodyType === 'form-data') {
              const formObj: Record<string, string> = {};
              activeRequest.formData.filter(f => f.enabled && f.key).forEach(f => {
                formObj[resolveVariables(f.key)] = resolveVariables(f.value);
              });
              body = JSON.stringify({ __formData: formObj });
              headers['Content-Type'] = 'application/json';
            }
          }

          const start = performance.now();
          const res = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: activeRequest.method, url: fullUrl, headers, body }),
          });
          const elapsed = Math.round(performance.now() - start);
          const data = await res.json();
          const responseBody = typeof data.body === 'string' ? data.body : JSON.stringify(data.body, null, 2);

          const apiRes: ApiResponse = {
            status: data.status || 0,
            statusText: data.statusText || 'Error',
            headers: data.headers || {},
            body: responseBody,
            time: data.time || elapsed,
            size: new Blob([responseBody]).size,
          };

          set({ response: apiRes, loading: false });

          const entry: HistoryEntry = {
            id: genId(),
            request: { ...get().activeRequest },
            response: apiRes,
            timestamp: new Date().toISOString(),
          };
          set((s) => ({ history: [entry, ...s.history].slice(0, 100) }));
        } catch (err: any) {
          set({
            response: {
              status: 0,
              statusText: 'Network Error',
              headers: {},
              body: err.message || 'Failed to send request',
              time: 0,
              size: 0,
            },
            loading: false,
          });
        }
      },

      // Collections
      addCollection: (name) => set((s) => ({
        collections: [...s.collections, { id: genId(), name, requests: [], variables: [] }],
      })),
      deleteCollection: (id) => set((s) => ({
        collections: s.collections.filter(c => c.id !== id),
        activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
      })),
      renameCollection: (id, name) => set((s) => ({
        collections: s.collections.map(c => c.id === id ? { ...c, name } : c),
      })),
      saveToCollection: (collectionId) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, requests: [...c.requests, { ...s.activeRequest, id: genId(), name: s.activeRequest.name || 'Untitled' }] }
            : c
        ),
      })),
      loadFromCollection: (collectionId, requestId) => {
        const col = get().collections.find(c => c.id === collectionId);
        const req = col?.requests.find(r => r.id === requestId);
        if (req) set({ activeRequest: { ...req }, response: null, activeCollectionId: collectionId });
      },
      deleteFromCollection: (collectionId, requestId) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, requests: c.requests.filter(r => r.id !== requestId) }
            : c
        ),
      })),

      // Per-collection variables
      setActiveCollectionId: (id) => set({ activeCollectionId: id }),
      setCollectionVariables: (collectionId, vars) => set((s) => ({
        collections: s.collections.map(c => c.id === collectionId ? { ...c, variables: vars } : c),
      })),
      addCollectionVariable: (collectionId) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, variables: [...c.variables, createKVPair()] }
            : c
        ),
      })),
      updateCollectionVariable: (collectionId, varId, field, val) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, variables: c.variables.map(v => v.id === varId ? { ...v, [field]: val } : v) }
            : c
        ),
      })),
      toggleCollectionVariable: (collectionId, varId) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, variables: c.variables.map(v => v.id === varId ? { ...v, enabled: !v.enabled } : v) }
            : c
        ),
      })),
      deleteCollectionVariable: (collectionId, varId) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, variables: c.variables.filter(v => v.id !== varId) }
            : c
        ),
      })),

      // History
      clearHistory: () => set({ history: [] }),
      loadFromHistory: (id) => {
        const entry = get().history.find(h => h.id === id);
        if (entry) set({ activeRequest: { ...entry.request }, response: entry.response });
      },

      // Environments
      addEnvironment: (name) => set((s) => ({
        environments: [...s.environments, { id: genId(), name, variables: [createKVPair()] }],
      })),
      deleteEnvironment: (id) => set((s) => ({
        environments: s.environments.filter(e => e.id !== id),
        activeEnvId: s.activeEnvId === id ? null : s.activeEnvId,
      })),
      updateEnvironment: (id, env) => set((s) => ({
        environments: s.environments.map(e => e.id === id ? { ...e, ...env } : e),
      })),
      setActiveEnvId: (id) => set({ activeEnvId: id }),

      // Global variables
      setGlobalVariables: (vars) => set({ globalVariables: vars }),
      addGlobalVariable: () => set((s) => ({
        globalVariables: [...s.globalVariables, createKVPair()],
      })),
      updateGlobalVariable: (id, field, val) => set((s) => ({
        globalVariables: s.globalVariables.map(v => v.id === id ? { ...v, [field]: val } : v),
      })),
      toggleGlobalVariable: (id) => set((s) => ({
        globalVariables: s.globalVariables.map(v => v.id === id ? { ...v, enabled: !v.enabled } : v),
      })),
      deleteGlobalVariable: (id) => set((s) => ({
        globalVariables: s.globalVariables.filter(v => v.id !== id),
      })),

      // UI
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      setActiveResponseTab: (tab) => set({ activeResponseTab: tab }),

      // Variable resolution: Global > Environment > Collection (last wins)
      resolveVariables: (text) => {
        if (!text) return text;
        const { globalVariables, environments, activeEnvId, collections, activeCollectionId } = get();
        const activeEnv = environments.find(e => e.id === activeEnvId);
        const activeCol = collections.find(c => c.id === activeCollectionId);

        // Merge order: global < env < collection (collection wins on conflict)
        const allVars = [
          ...globalVariables.filter(v => v.enabled),
          ...(activeEnv?.variables.filter(v => v.enabled) || []),
          ...(activeCol?.variables.filter(v => v.enabled) || []),
        ];

        return text.replace(/\{\{(\s*[\w.-]+\s*)\}\}/g, (_, key) => {
          const trimmed = key.trim();
          // Last match wins (collection > env > global)
          const matches = allVars.filter(vv => vv.key === trimmed);
          return matches.length > 0 ? matches[matches.length - 1].value : `{{${trimmed}}}`;
        });
      },
      getActiveVariables: () => {
        const { globalVariables, environments, activeEnvId, collections, activeCollectionId } = get();
        const activeEnv = environments.find(e => e.id === activeEnvId);
        const activeCol = collections.find(c => c.id === activeCollectionId);
        return [
          ...globalVariables.filter(v => v.enabled),
          ...(activeEnv?.variables.filter(v => v.enabled) || []),
          ...(activeCol?.variables.filter(v => v.enabled) || []),
        ];
      },

      // Import / Export
      exportCollection: (collectionId) => {
        const col = get().collections.find(c => c.id === collectionId);
        if (!col) return '';
        return JSON.stringify({
          _exportType: 'api-playground-collection',
          _version: 1,
          exportedAt: new Date().toISOString(),
          collection: {
            name: col.name,
            variables: col.variables,
            requests: col.requests,
          },
        }, null, 2);
      },
      exportAllCollections: () => {
        const { collections } = get();
        return JSON.stringify({
          _exportType: 'api-playground-collections',
          _version: 1,
          exportedAt: new Date().toISOString(),
          collections: collections.map(c => ({
            name: c.name,
            variables: c.variables,
            requests: c.requests,
          })),
        }, null, 2);
      },
      importCollection: (json) => {
        try {
          const data = JSON.parse(json);
          if (data._exportType === 'api-playground-collection') {
            // Single collection import
            const col = data.collection;
            set((s) => ({
              collections: [...s.collections, {
                id: genId(),
                name: col.name || 'Imported Collection',
                variables: col.variables || [],
                requests: col.requests || [],
              }],
            }));
            return true;
          } else if (data._exportType === 'api-playground-collections') {
            // Multiple collections import
            set((s) => ({
              collections: [
                ...s.collections,
                ...((data.collections || []).map((c: any) => ({
                  id: genId(),
                  name: c.name || 'Imported Collection',
                  variables: c.variables || [],
                  requests: c.requests || [],
                }))),
              ],
            }));
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    }),
    { name: 'api-playground-store' }
  )
);
