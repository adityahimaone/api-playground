import { db } from '../storage/dexie';
import type { HistoryEntry } from '../entities';

const table = () => db.history;

export const historyRepository = {
  async getAll(limit = 100): Promise<HistoryEntry[]> {
    return table().orderBy('timestamp').reverse().limit(limit).toArray();
  },

  async create(entry: HistoryEntry): Promise<void> {
    await table().add(entry);
  },

  async clearAll(): Promise<void> {
    await table().clear();
  },

  async deleteOlderThan(timestamp: number): Promise<void> {
    await table().where('timestamp').below(timestamp).delete();
  },
};
