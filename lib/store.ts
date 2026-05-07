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
  saveToCollection: (collectionId: string) => void;
  loadFromCollection: (collectionId: string, requestId: string) => void;
  deleteFromCollection: (collectionId: string, requestId: string) => void;

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

  // Helpers
  resolveVariables: (text: string) => string;
  getActiveVariables: () => KVPair[];
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
          // Build query params
          const enabledParams = activeRequest.params.filter(p => p.enabled && p.key);
          let fullUrl = resolvedUrl;
          if (enabledParams.length > 0) {
            const qs = new URLSearchParams(
              enabledParams.map(p => [resolveVariables(p.key), resolveVariables(p.value)])
            ).toString();
            fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
          }

          // Build headers
          const headers: Record<string, string> = {};
          activeRequest.headers.filter(h => h.enabled && h.key).forEach(h => {
            headers[resolveVariables(h.key)] = resolveVariables(h.value);
          });

          // Auth
          if (activeRequest.auth.type === 'bearer' && activeRequest.auth.token) {
            headers['Authorization'] = `Bearer ${resolveVariables(activeRequest.auth.token)}`;
          } else if (activeRequest.auth.type === 'basic' && activeRequest.auth.username) {
            headers['Authorization'] = `Basic ${btoa(`${resolveVariables(activeRequest.auth.username)}:${resolveVariables(activeRequest.auth.password)}`)}`;
          }

          // Body
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
              const fd = new FormData();
              activeRequest.formData.filter(f => f.enabled && f.key).forEach(f => {
                fd.append(resolveVariables(f.key), resolveVariables(f.value));
              });
              // Can't use fetch with FormData body directly to /api/proxy, send as JSON
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
            body: JSON.stringify({
              method: activeRequest.method,
              url: fullUrl,
              headers,
              body,
            }),
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

          // Add to history
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
        collections: [...s.collections, { id: genId(), name, requests: [] }],
      })),
      deleteCollection: (id) => set((s) => ({
        collections: s.collections.filter(c => c.id !== id),
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
        if (req) set({ activeRequest: { ...req }, response: null });
      },
      deleteFromCollection: (collectionId, requestId) => set((s) => ({
        collections: s.collections.map(c =>
          c.id === collectionId
            ? { ...c, requests: c.requests.filter(r => r.id !== requestId) }
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

      // Variable resolution
      resolveVariables: (text) => {
        if (!text) return text;
        const { globalVariables, environments, activeEnvId } = get();
        const activeEnv = environments.find(e => e.id === activeEnvId);
        const allVars = [
          ...globalVariables.filter(v => v.enabled),
          ...(activeEnv?.variables.filter(v => v.enabled) || []),
        ];
        return text.replace(/\{\{(\s*[\w.-]+\s*)\}\}/g, (_, key) => {
          const trimmed = key.trim();
          const v = allVars.find(vv => vv.key === trimmed);
          return v ? v.value : `{{${trimmed}}}`;
        });
      },
      getActiveVariables: () => {
        const { globalVariables, environments, activeEnvId } = get();
        const activeEnv = environments.find(e => e.id === activeEnvId);
        return [
          ...globalVariables.filter(v => v.enabled),
          ...(activeEnv?.variables.filter(v => v.enabled) || []),
        ];
      },
    }),
    { name: 'api-playground-store' }
  )
);
