import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ApiRequest, ApiResponse, Workspace, Collection, CollectionItem, Environment, HistoryEntry,
  createRequest, createKVPair, createWorkspace, createFolder, createRequestItem, KVPair
} from './types';
import { importPostmanCollection, isPostmanCollection } from './postman-import';
import {
  addItem, addItemToFolder, removeItem, renameItem, findItem, countRequests
} from './collection-tree';

interface PlaygroundStore {
  // Active request
  activeRequest: ApiRequest;
  response: ApiResponse | null;
  loading: boolean;

  // Workspaces (collections nested inside)
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  // History (global)
  history: HistoryEntry[];

  // Environments
  environments: Environment[];
  activeEnvId: string | null;

  // Global variables
  globalVariables: KVPair[];

  // UI state
  sidebarTab: 'collections' | 'history' | 'variables';
  activeResponseTab: 'body' | 'headers' | 'meta';

  // ---- Workspace actions ----
  addWorkspace: (name: string) => void;
  deleteWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setActiveWorkspaceId: (id: string | null) => void;

  // ---- Request actions ----
  updateRequest: (req: Partial<ApiRequest>) => void;
  setActiveRequest: (req: ApiRequest) => void;
  setResponse: (res: ApiResponse | null) => void;
  setLoading: (l: boolean) => void;
  sendRequest: () => Promise<void>;

  // ---- Collection actions (scoped to active workspace) ----
  addCollection: (name: string) => void;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  saveToCollection: (collectionId: string, parentFolderId?: string) => void;
  loadFromCollectionItem: (collectionId: string, itemId: string) => void;
  deleteFromCollectionItem: (collectionId: string, itemId: string) => void;

  // ---- Tree operations within a collection ----
  addFolderToCollection: (collectionId: string, parentFolderId: string | null, name: string) => void;
  renameCollectionItem: (collectionId: string, itemId: string, name: string) => void;

  // ---- Per-collection variables ----
  setCollectionVariables: (collectionId: string, vars: KVPair[]) => void;
  addCollectionVariable: (collectionId: string) => void;
  updateCollectionVariable: (collectionId: string, varId: string, field: 'key' | 'value', val: string) => void;
  toggleCollectionVariable: (collectionId: string, varId: string) => void;
  deleteCollectionVariable: (collectionId: string, varId: string) => void;
  activeCollectionId: string | null;
  setActiveCollectionId: (id: string | null) => void;

  // ---- History ----
  clearHistory: () => void;
  loadFromHistory: (id: string) => void;

  // ---- Environment actions ----
  addEnvironment: (name: string) => void;
  deleteEnvironment: (id: string) => void;
  updateEnvironment: (id: string, env: Partial<Environment>) => void;
  setActiveEnvId: (id: string | null) => void;

  // ---- Global variables ----
  setGlobalVariables: (vars: KVPair[]) => void;
  addGlobalVariable: () => void;
  updateGlobalVariable: (id: string, field: 'key' | 'value', val: string) => void;
  toggleGlobalVariable: (id: string) => void;
  deleteGlobalVariable: (id: string) => void;

  // ---- UI ----
  setSidebarTab: (tab: 'collections' | 'history' | 'variables') => void;
  setActiveResponseTab: (tab: 'body' | 'headers' | 'meta') => void;

  // ---- Variable resolution (Global > Env > Collection) ----
  resolveVariables: (text: string) => string;
  getActiveVariables: () => KVPair[];

  // ---- Import / Export (per-workspace) ----
  exportWorkspace: (workspaceId: string) => string;
  exportAllWorkspaces: () => string;
  importWorkspace: (json: string) => boolean;
}

const genId = () => Math.random().toString(36).slice(2, 10);

// Helper: operate on active workspace's collections
function mapActiveWorkspaceCollections(
  state: PlaygroundStore,
  fn: (collections: Collection[]) => Collection[]
): Partial<PlaygroundStore> {
  const { workspaces, activeWorkspaceId } = state;
  const ws = workspaces.find(w => w.id === activeWorkspaceId);
  if (!ws) return {};
  return {
    workspaces: workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, collections: fn(w.collections) } : w
    ),
  };
}

// Migration: convert old flat collections to tree-based
function migrateState(state: any): any {
  if (state.workspaces && state.workspaces.length > 0) {
    // Migrate flat collection.requests → collection.items
    return {
      ...state,
      workspaces: state.workspaces.map((ws: any) => ({
        ...ws,
        collections: (ws.collections || []).map((c: any) => {
          if (c.items) return c; // already tree-based
          // Convert flat requests array to items array
          const items: any[] = (c.requests || []).map((r: any) => ({
            type: 'request',
            id: r.id || genId(),
            request: r,
          }));
          return { ...c, items, requests: undefined };
        }),
      })),
    };
  }

  // No workspaces → create default
  return {
    ...state,
    workspaces: [createWorkspace('My Workspace')],
    activeWorkspaceId: state.activeWorkspaceId || null,
  };
}

export const usePlaygroundStore = create<PlaygroundStore>()(
  persist(
    (set, get) => ({
      activeRequest: createRequest(),
      response: null,
      loading: false,
      workspaces: [createWorkspace('My Workspace')],
      activeWorkspaceId: null,
      history: [],
      environments: [],
      activeEnvId: null,
      globalVariables: [],
      activeCollectionId: null,
      sidebarTab: 'collections',
      activeResponseTab: 'body',

      // ---- Workspace actions ----
      addWorkspace: (name) => set((s) => {
        const ws = createWorkspace(name);
        return { workspaces: [...s.workspaces, ws], activeWorkspaceId: ws.id };
      }),
      deleteWorkspace: (id) => set((s) => {
        const remaining = s.workspaces.filter(w => w.id !== id);
        return {
          workspaces: remaining,
          activeWorkspaceId: s.activeWorkspaceId === id ? (remaining[0]?.id || null) : s.activeWorkspaceId,
        };
      }),
      renameWorkspace: (id, name) => set((s) => ({
        workspaces: s.workspaces.map(w => w.id === id ? { ...w, name } : w),
      })),
      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id, activeCollectionId: null }),

      // ---- Request actions ----
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

      // ---- Collection actions (scoped to active workspace) ----
      addCollection: (name) => set((s) => {
        const col: Collection = { id: genId(), name, items: [], variables: [] };
        return mapActiveWorkspaceCollections(s, cols => [...cols, col]);
      }),
      deleteCollection: (id) => set((s) => ({
        ...mapActiveWorkspaceCollections(s, cols => cols.filter(c => c.id !== id)),
        activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
      })),
      renameCollection: (id, name) => set((s) =>
        mapActiveWorkspaceCollections(s, cols => cols.map(c => c.id === id ? { ...c, name } : c))
      ),

      // Save current active request into a collection (optionally inside a folder)
      saveToCollection: (collectionId, parentFolderId) => set((s) => {
        const newReqItem = createRequestItem({
          ...s.activeRequest,
          id: genId(),
          name: s.activeRequest.name || 'Untitled',
        });
        return mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => {
            if (c.id !== collectionId) return c;
            if (parentFolderId) {
              return { ...c, items: addItemToFolder(c.items, parentFolderId, newReqItem) };
            }
            return { ...c, items: addItem(c.items, newReqItem) };
          })
        );
      }),

      // Load a request from anywhere in the tree
      loadFromCollectionItem: (collectionId, itemId) => {
        const { workspaces, activeWorkspaceId } = get();
        const ws = workspaces.find(w => w.id === activeWorkspaceId);
        const col = ws?.collections.find(c => c.id === collectionId);
        if (!col) return;
        const item = findItem(col.items, itemId);
        if (item?.type === 'request') {
          set({ activeRequest: { ...item.request }, response: null, activeCollectionId: collectionId });
        }
      },

      // Delete any item from a collection tree
      deleteFromCollectionItem: (collectionId, itemId) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId ? { ...c, items: removeItem(c.items, itemId) } : c)
        )
      ),

      // Add a folder inside a collection (optionally inside another folder)
      addFolderToCollection: (collectionId, parentFolderId, name) => set((s) => {
        const newFolder = createFolder(name);
        return mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => {
            if (c.id !== collectionId) return c;
            if (parentFolderId) {
              return { ...c, items: addItemToFolder(c.items, parentFolderId, newFolder) };
            }
            return { ...c, items: addItem(c.items, newFolder) };
          })
        );
      }),

      // Rename any item in a collection tree
      renameCollectionItem: (collectionId, itemId, name) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId ? { ...c, items: renameItem(c.items, itemId, name) } : c)
        )
      ),

      // ---- Per-collection variables ----
      setActiveCollectionId: (id) => set({ activeCollectionId: id }),
      setCollectionVariables: (collectionId, vars) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId ? { ...c, variables: vars } : c)
        )
      ),
      addCollectionVariable: (collectionId) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId ? { ...c, variables: [...c.variables, createKVPair()] } : c)
        )
      ),
      updateCollectionVariable: (collectionId, varId, field, val) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId
            ? { ...c, variables: c.variables.map(v => v.id === varId ? { ...v, [field]: val } : v) }
            : c
          )
        )
      ),
      toggleCollectionVariable: (collectionId, varId) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId
            ? { ...c, variables: c.variables.map(v => v.id === varId ? { ...v, enabled: !v.enabled } : v) }
            : c
          )
        )
      ),
      deleteCollectionVariable: (collectionId, varId) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId
            ? { ...c, variables: c.variables.filter(v => v.id !== varId) }
            : c
          )
        )
      ),

      // ---- History ----
      clearHistory: () => set({ history: [] }),
      loadFromHistory: (id) => {
        const entry = get().history.find(h => h.id === id);
        if (entry) set({ activeRequest: { ...entry.request }, response: entry.response });
      },

      // ---- Environments ----
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

      // ---- Global variables ----
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

      // ---- UI ----
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      setActiveResponseTab: (tab) => set({ activeResponseTab: tab }),

      // ---- Variable resolution: Global < Environment < Collection (last wins) ----
      resolveVariables: (text) => {
        if (!text) return text;
        const { globalVariables, environments, activeEnvId, workspaces, activeWorkspaceId, activeCollectionId } = get();
        const activeEnv = environments.find(e => e.id === activeEnvId);
        const ws = workspaces.find(w => w.id === activeWorkspaceId);
        const activeCol = ws?.collections.find(c => c.id === activeCollectionId);

        const allVars = [
          ...globalVariables.filter(v => v.enabled),
          ...(activeEnv?.variables.filter(v => v.enabled) || []),
          ...(activeCol?.variables.filter(v => v.enabled) || []),
        ];

        return text.replace(/\{\{(\s*[\w.-]+\s*)\}\}/g, (_, key) => {
          const trimmed = key.trim();
          const matches = allVars.filter(vv => vv.key === trimmed);
          return matches.length > 0 ? matches[matches.length - 1].value : `{{${trimmed}}}`;
        });
      },
      getActiveVariables: () => {
        const { globalVariables, environments, activeEnvId, workspaces, activeWorkspaceId, activeCollectionId } = get();
        const activeEnv = environments.find(e => e.id === activeEnvId);
        const ws = workspaces.find(w => w.id === activeWorkspaceId);
        const activeCol = ws?.collections.find(c => c.id === activeCollectionId);
        return [
          ...globalVariables.filter(v => v.enabled),
          ...(activeEnv?.variables.filter(v => v.enabled) || []),
          ...(activeCol?.variables.filter(v => v.enabled) || []),
        ];
      },

      // ---- Import / Export ----
      exportWorkspace: (workspaceId) => {
        const ws = get().workspaces.find(w => w.id === workspaceId);
        if (!ws) return '';
        return JSON.stringify({
          _exportType: 'api-playground-workspace',
          _version: 2,
          exportedAt: new Date().toISOString(),
          workspace: { name: ws.name, collections: ws.collections },
        }, null, 2);
      },
      exportAllWorkspaces: () => {
        const { workspaces } = get();
        return JSON.stringify({
          _exportType: 'api-playground-workspaces',
          _version: 2,
          exportedAt: new Date().toISOString(),
          workspaces: workspaces.map(w => ({ name: w.name, collections: w.collections })),
        }, null, 2);
      },
      importWorkspace: (json) => {
        try {
          const data = JSON.parse(json);

          // ── Postman Collection v2.1.0 — import into ACTIVE workspace ──
          if (isPostmanCollection(json)) {
            const result = importPostmanCollection(json);
            if (!result.success) return false;

            const { activeWorkspaceId, workspaces } = get();
            let targetWsId = activeWorkspaceId;

            // If no active workspace, use first or create one
            if (!targetWsId) {
              if (workspaces.length > 0) {
                targetWsId = workspaces[0].id;
              } else {
                const ws = createWorkspace('Imported from Postman');
                ws.collections = result.collections;
                set((s) => ({
                  workspaces: [...s.workspaces, ws],
                  activeWorkspaceId: ws.id,
                }));
                return true;
              }
            }

            // Add collections to the active workspace
            set((s) => ({
              workspaces: s.workspaces.map(w =>
                w.id === targetWsId
                  ? { ...w, collections: [...w.collections, ...result.collections] }
                  : w
              ),
            }));
            return true;
          }

          // ── API Playground export formats ──
          if (data._exportType === 'api-playground-workspace') {
            // Add to active workspace
            const { activeWorkspaceId, workspaces } = get();
            let targetWsId = activeWorkspaceId;
            if (!targetWsId && workspaces.length > 0) targetWsId = workspaces[0].id;

            const importedCollections = (data.workspace?.collections || []).map((c: any) => ({
              id: genId(),
              name: c.name || 'Imported Collection',
              variables: c.variables || [],
              items: c.items || (c.requests || []).map((r: any) => ({
                type: 'request',
                id: r.id || genId(),
                request: r,
              })),
            }));

            if (!targetWsId) {
              const ws = createWorkspace(data.workspace?.name || 'Imported Workspace');
              ws.collections = importedCollections;
              set((s) => ({ workspaces: [...s.workspaces, ws], activeWorkspaceId: ws.id }));
            } else {
              set((s) => ({
                workspaces: s.workspaces.map(w =>
                  w.id === targetWsId
                    ? { ...w, collections: [...w.collections, ...importedCollections] }
                    : w
                ),
              }));
            }
            return true;
          }

          if (data._exportType === 'api-playground-workspaces') {
            const { activeWorkspaceId, workspaces } = get();
            let targetWsId = activeWorkspaceId;
            if (!targetWsId && workspaces.length > 0) targetWsId = workspaces[0].id;

            const importedCollections: Collection[] = [];
            for (const w of (data.workspaces || [])) {
              for (const c of (w.collections || [])) {
                importedCollections.push({
                  id: genId(),
                  name: c.name || 'Imported Collection',
                  variables: c.variables || [],
                  items: c.items || (c.requests || []).map((r: any) => ({
                    type: 'request',
                    id: r.id || genId(),
                    request: r,
                  })),
                });
              }
            }

            if (!targetWsId && importedCollections.length > 0) {
              const ws = createWorkspace('Imported');
              ws.collections = importedCollections;
              set((s) => ({ workspaces: [...s.workspaces, ws], activeWorkspaceId: ws.id }));
            } else if (targetWsId) {
              set((s) => ({
                workspaces: s.workspaces.map(w =>
                  w.id === targetWsId
                    ? { ...w, collections: [...w.collections, ...importedCollections] }
                    : w
                ),
              }));
            }
            return true;
          }

          // Backward compat: old single-collection export
          if (data._exportType === 'api-playground-collection' || data._exportType === 'api-playground-collections') {
            const collections = data._exportType === 'api-playground-collections'
              ? (data.collections || [])
              : [data.collection];

            const importedCollections: Collection[] = collections.map((c: any) => ({
              id: genId(),
              name: c.name || 'Imported Collection',
              variables: c.variables || [],
              items: c.items || (c.requests || []).map((r: any) => ({
                type: 'request',
                id: r.id || genId(),
                request: r,
              })),
            }));

            const { activeWorkspaceId, workspaces } = get();
            let targetWsId = activeWorkspaceId;
            if (!targetWsId && workspaces.length > 0) targetWsId = workspaces[0].id;

            if (!targetWsId) {
              const ws = createWorkspace('Imported');
              ws.collections = importedCollections;
              set((s) => ({ workspaces: [...s.workspaces, ws], activeWorkspaceId: ws.id }));
            } else {
              set((s) => ({
                workspaces: s.workspaces.map(w =>
                  w.id === targetWsId
                    ? { ...w, collections: [...w.collections, ...importedCollections] }
                    : w
                ),
              }));
            }
            return true;
          }

          return false;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'api-playground-store',
      version: 3,
      migrate: (persisted: any, version: number) => {
        let state = persisted;
        // Always run migration to ensure tree-based format
        state = migrateState(state);
        return state;
      },
    }
  )
);
