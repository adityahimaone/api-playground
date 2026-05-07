import { db } from '../storage/dexie';
import type { VariableEntity, VariableScope } from '../entities/index';

const table = () => db.variables;

export const variableRepository = {
  async getAll(): Promise<VariableEntity[]> {
    return table().toArray();
  },

  async getByScope(scope: VariableScope, scopeId?: string): Promise<VariableEntity[]> {
    if (scopeId) {
      return table().where('scope').equals(scope).and(v => v.scopeId === scopeId).toArray();
    }
    return table().where('scope').equals(scope).toArray();
  },

  async getById(id: string): Promise<VariableEntity | undefined> {
    return table().get(id);
  },

  async create(v: VariableEntity): Promise<string> {
    return table().add(v);
  },

  async update(id: string, changes: Partial<VariableEntity>): Promise<void> {
    await table().update(id, changes);
  },

  async delete(id: string): Promise<void> {
    await table().delete(id);
  },

  async bulkCreate(vars: VariableEntity[]): Promise<void> {
    await table().bulkAdd(vars);
  },

  async bulkDelete(ids: string[]): Promise<void> {
    await table().bulkDelete(ids);
  },

  async getByScopeId(scopeId: string): Promise<VariableEntity[]> {
    return table().where('scopeId').equals(scopeId).toArray();
  },

  async deleteByScopeId(scopeId: string): Promise<void> {
    const vars = await table().where('scopeId').equals(scopeId).toArray();
    await table().bulkDelete(vars.map(v => v.id));
  },
};
