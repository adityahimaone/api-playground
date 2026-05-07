import { create } from 'zustand';
import {
  Tab,
  ApiResponse,
  ContextMenuState,
  RequestEntity,
} from '../entities';
import { useRequestStore } from './request.store';

interface UIState {
  activeTabId: string | null;
  tabs: Tab[];
  sidebarTab: 'collections' | 'history' | 'variables';
  theme: 'light' | 'dark';
  expandedNodeIds: string[];
  searchQuery: string;
  contextMenu: ContextMenuState;
  activeEnvId: string | null;
  loading: boolean;
  response: ApiResponse | null;
}

interface UIActions {
  openTab: (requestId: string) => Tab;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateDraft: (tabId: string, changes: Partial<RequestEntity>) => void;
  saveDraft: (tabId: string) => void;
  toggleExpanded: (nodeId: string) => void;
  setSidebarTab: (tab: 'collections' | 'history' | 'variables') => void;
  setSearchQuery: (query: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  showContextMenu: (state: Omit<ContextMenuState, 'visible'>) => void;
  hideContextMenu: () => void;
  setLoading: (loading: boolean) => void;
  setResponse: (response: ApiResponse | null) => void;
}

const genId = () => Math.random().toString(36).slice(2, 10);

const defaultContextMenu: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  nodeType: 'request',
  nodeId: '',
};

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  activeTabId: null,
  tabs: [],
  sidebarTab: 'collections',
  theme: 'light',
  expandedNodeIds: [],
  searchQuery: '',
  contextMenu: defaultContextMenu,
  activeEnvId: null,
  loading: false,
  response: null,

  openTab: (requestId) => {
    const { tabs } = get();

    // Check if tab already exists
    const existing = tabs.find((t) => t.requestId === requestId);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing;
    }

    // Get request data from request store for draft initial state
    const request = useRequestStore.getState().getRequest(requestId);

    const tab: Tab = {
      id: genId(),
      requestId,
      draftState: request ? { ...request } : {},
      isDirty: false,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));

    return tab;
  },

  closeTab: (tabId) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      const newActiveId =
        state.activeTabId === tabId
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeTabId;

      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateDraft: (tabId, changes) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              draftState: { ...t.draftState, ...changes },
              isDirty: true,
            }
          : t
      ),
    }));
  },

  saveDraft: (tabId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || !tab.isDirty) return;

    // Persist to request store
    useRequestStore.getState().updateRequest(tab.requestId, tab.draftState);

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: false } : t
      ),
    }));
  },

  toggleExpanded: (nodeId) => {
    set((state) => {
      const expanded = [...state.expandedNodeIds];
      const index = expanded.indexOf(nodeId);
      if (index >= 0) {
        expanded.splice(index, 1);
      } else {
        expanded.push(nodeId);
      }
      return { expandedNodeIds: expanded };
    });
  },

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setTheme: (theme) => set({ theme }),

  showContextMenu: (state) => {
    set({ contextMenu: { ...state, visible: true } });
  },

  hideContextMenu: () => {
    set({ contextMenu: defaultContextMenu });
  },

  setLoading: (loading) => set({ loading }),

  setResponse: (response) => set({ response }),
}));
