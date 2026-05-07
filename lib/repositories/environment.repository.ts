import { db } from '../storage/dexie';
import type { Environment } from '../entities';

const table = () => db.environments;

export const environmentRepository = {
  async getAll(): Promise<Environment[]> {
    return table().toArray();
  },

  async getById(id: string): Promise<Environment | undefined> {
    return table().get(id);
  },

  async create(env: Environment): Promise<string> {
    return table().add(env);
  },

  async update(id: string, changes: Partial<Environment>): Promise<number> {
    return table().update(id, changes);
  },

  async delete(id: string): Promise<void> {
    await table().delete(id);
  },

  async setActive(id: string): Promise<void> {
    // Deactivate all environments first
    const all = await table().toArray();
    await Promise.all(
      all.map((env) => table().update(env.id, { isActive: env.id === id }))
    );
  },
};
