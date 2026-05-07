import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ApiRequest, ApiResponse, Workspace, Collection, Environment, HistoryEntry,
  createRequest, createKVPair, createWorkspace, KVPair
} from './types';
import { importPostmanCollection, isPostmanCollection } from './postman-import';

interface PlaygroundStore {
  // Active request
  activeRequest: ApiRequest;
  response: ApiResponse | null;
  loading: boolean;

  // Workspaces (collections nested inside)
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  // History (global, not per-workspace)
  history: HistoryEntry[];

  // Environments (global for now, per-workspace later)
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
  saveToCollection: (collectionId: string) => void;
  loadFromCollection: (collectionId: string, requestId: string) => void;
  deleteFromCollection: (collectionId: string, requestId: string) => void;

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

// Helper: operate on active workspace's collections using state snapshot
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

// Migration: convert old flat collections to workspace-scoped
function migrateState(state: any): any {
  // If workspaces exist already, nothing to migrate
  if (state.workspaces && state.workspaces.length > 0) return state;

  // Old format: flat collections array at root
  const collections = state.collections || [];
  if (collections.length === 0) {
    // No data to migrate — create default workspace
    return {
      ...state,
      workspaces: [createWorkspace('My Workspace')],
      activeWorkspaceId: state.activeWorkspaceId || null,
    };
  }

  // Migrate old collections into a default workspace
  const defaultWs = createWorkspace('My Workspace');
  defaultWs.collections = collections.map((c: any) => ({
    id: c.id,
    name: c.name,
    requests: c.requests || [],
    variables: c.variables || [],
  }));

  return {
    ...state,
    workspaces: [defaultWs],
    activeWorkspaceId: defaultWs.id,
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
        return {
          workspaces: [...s.workspaces, ws],
          activeWorkspaceId: ws.id,
        };
      }),
      deleteWorkspace: (id) => set((s) => {
        const remaining = s.workspaces.filter(w => w.id !== id);
        // If deleting the active workspace, switch to first available
        const newActive = s.activeWorkspaceId === id
          ? (remaining[0]?.id || null)
          : s.activeWorkspaceId;
        return {
          workspaces: remaining,
          activeWorkspaceId: newActive,
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
        const col: Collection = { id: genId(), name, requests: [], variables: [] };
        return mapActiveWorkspaceCollections(s, cols => [...cols, col]);
      }),
      deleteCollection: (id) => set((s) => ({
        ...mapActiveWorkspaceCollections(s, cols => cols.filter(c => c.id !== id)),
        activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
      })),
      renameCollection: (id, name) => set((s) =>
        mapActiveWorkspaceCollections(s, cols => cols.map(c => c.id === id ? { ...c, name } : c))
      ),
      saveToCollection: (collectionId) => set((s) => {
        const newReq = { ...s.activeRequest, id: genId(), name: s.activeRequest.name || 'Untitled' };
        return mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId ? { ...c, requests: [...c.requests, newReq] } : c)
        );
      }),
      loadFromCollection: (collectionId, requestId) => {
        const { workspaces, activeWorkspaceId } = get();
        const ws = workspaces.find(w => w.id === activeWorkspaceId);
        const col = ws?.collections.find(c => c.id === collectionId);
        const req = col?.requests.find(r => r.id === requestId);
        if (req) set({ activeRequest: { ...req }, response: null, activeCollectionId: collectionId });
      },
      deleteFromCollection: (collectionId, requestId) => set((s) =>
        mapActiveWorkspaceCollections(s, cols =>
          cols.map(c => c.id === collectionId
            ? { ...c, requests: c.requests.filter(r => r.id !== requestId) }
            : c
          )
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
          cols.map(c => c.id === collectionId
            ? { ...c, variables: [...c.variables, createKVPair()] }
            : c
          )
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

      // ---- Import / Export (per-workspace) ----
      exportWorkspace: (workspaceId) => {
        const ws = get().workspaces.find(w => w.id === workspaceId);
        if (!ws) return '';
        return JSON.stringify({
          _exportType: 'api-playground-workspace',
          _version: 1,
          exportedAt: new Date().toISOString(),
          workspace: { name: ws.name, collections: ws.collections },
        }, null, 2);
      },
      exportAllWorkspaces: () => {
        const { workspaces } = get();
        return JSON.stringify({
          _exportType: 'api-playground-workspaces',
          _version: 1,
          exportedAt: new Date().toISOString(),
          workspaces: workspaces.map(w => ({ name: w.name, collections: w.collections })),
        }, null, 2);
      },
      importWorkspace: (json) => {
        try {
          const data = JSON.parse(json);

          // ── Postman Collection v2.1.0 import ──
          if (isPostmanCollection(json)) {
            const result = importPostmanCollection(json);
            if (!result.success) return false;
            const ws = createWorkspace(data.info?.name || 'Imported from Postman');
            ws.collections = result.collections;
            // Attach collection-level variables from Postman top-level vars
            if (result.variables.length > 0 && ws.collections.length > 0) {
              ws.collections[0].variables = result.variables;
            }
            set((s) => ({
              workspaces: [...s.workspaces, ws],
              activeWorkspaceId: ws.id,
            }));
            return true;
          }

          if (data._exportType === 'api-playground-workspace') {
            const ws = createWorkspace(data.workspace?.name || 'Imported Workspace');
            ws.collections = (data.workspace?.collections || []).map((c: any) => ({
              id: genId(),
              name: c.name || 'Imported Collection',
              variables: c.variables || [],
              requests: c.requests || [],
            }));
            set((s) => ({
              workspaces: [...s.workspaces, ws],
              activeWorkspaceId: ws.id,
            }));
            return true;
          } else if (data._exportType === 'api-playground-workspaces') {
            set((s) => ({
              workspaces: [
                ...s.workspaces,
                ...((data.workspaces || []).map((w: any) => {
                  const ws = createWorkspace(w.name || 'Imported Workspace');
                  ws.collections = (w.collections || []).map((c: any) => ({
                    id: genId(),
                    name: c.name || 'Imported Collection',
                    variables: c.variables || [],
                    requests: c.requests || [],
                  }));
                  return ws;
                })),
              ],
            }));
            return true;
          }
          // Backward compat: old single-collection export
          if (data._exportType === 'api-playground-collection') {
            const ws = createWorkspace('Imported');
            ws.collections = [{
              id: genId(),
              name: data.collection?.name || 'Imported Collection',
              variables: data.collection?.variables || [],
              requests: data.collection?.requests || [],
            }];
            set((s) => ({
              workspaces: [...s.workspaces, ws],
              activeWorkspaceId: ws.id,
            }));
            return true;
          }
          if (data._exportType === 'api-playground-collections') {
            const ws = createWorkspace('Imported');
            ws.collections = (data.collections || []).map((c: any) => ({
              id: genId(),
              name: c.name || 'Imported Collection',
              variables: c.variables || [],
              requests: c.requests || [],
            }));
            set((s) => ({
              workspaces: [...s.workspaces, ws],
              activeWorkspaceId: ws.id,
            }));
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
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return migrateState(persisted);
        }
        return persisted;
      },
    }
  )
);
