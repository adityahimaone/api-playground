import { db } from '../storage/dexie';
import type { ResponseExample } from '../entities';

const table = () => db.responses;

export const responseRepository = {
  async getAll(): Promise<ResponseExample[]> {
    return table().toArray();
  },

  async getByRequestId(requestId: string): Promise<ResponseExample[]> {
    return table().where('requestId').equals(requestId).toArray();
  },

  async create(resp: ResponseExample): Promise<void> {
    await table().add(resp);
  },

  async delete(id: string): Promise<void> {
    await table().delete(id);
  },

  async bulkCreate(resps: ResponseExample[]): Promise<void> {
    await table().bulkAdd(resps);
  },
};
