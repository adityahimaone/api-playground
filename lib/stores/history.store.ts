import { create } from 'zustand';
import { HistoryEntry } from '../entities';

const MAX_HISTORY_ENTRIES = 200;

interface HistoryState {
  entries: HistoryEntry[];
}

interface HistoryActions {
  loadEntries: (entries: HistoryEntry[]) => void;
  addEntry: (entry: HistoryEntry) => void;
  clearHistory: () => void;
}

type HistoryStore = HistoryState & HistoryActions;

export const useHistoryStore = create<HistoryStore>((set) => ({
  entries: [],

  loadEntries: (entries) => {
    set({ entries });
  },

  addEntry: (entry) => {
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_HISTORY_ENTRIES),
    }));
  },

  clearHistory: () => {
    set({ entries: [] });
  },
}));
