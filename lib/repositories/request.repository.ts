import { db } from '../storage/dexie';
import type { RequestEntity } from '../entities';

const table = () => db.requests;

export const requestRepository = {
  async getAll(): Promise<RequestEntity[]> {
    return table().toArray();
  },

  async getById(id: string): Promise<RequestEntity | undefined> {
    return table().get(id);
  },

  async create(req: RequestEntity): Promise<string> {
    return table().add(req);
  },

  async update(id: string, changes: Partial<RequestEntity>): Promise<number> {
    return table().update(id, changes);
  },

  async delete(id: string): Promise<void> {
    return table().delete(id);
  },

  async bulkCreate(reqs: RequestEntity[]): Promise<void> {
    await table().bulkAdd(reqs);
  },
};
