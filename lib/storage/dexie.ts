import Dexie, { type Table } from 'dexie';
import type {
  TreeNode,
  RequestEntity,
  ResponseExample,
  Environment,
  HistoryEntry,
  VariableEntity,
} from '../entities';

class ApiPlaygroundDB extends Dexie {
  treeNodes!: Table<TreeNode>;
  requests!: Table<RequestEntity>;
  responses!: Table<ResponseExample>;
  environments!: Table<Environment>;
  variables!: Table<VariableEntity>;
  history!: Table<HistoryEntry>;
  appSettings!: Table<{ id: string; value: unknown }>;

  constructor() {
    super('ApiPlaygroundDB');

    this.version(1).stores({
      treeNodes: 'id, parentId, type, order',
      requests: 'id',
      responses: 'id, requestId',
      environments: 'id',
      history: 'id, timestamp',
      appSettings: 'id',
    });

    this.version(2).stores({
      variables: 'id, scope, scopeId, key',
    }).upgrade(async (tx) => {
      // Migrate: extract variables from old environment objects
      try {
        const envs = await (tx as any).table('environments').toArray();
        const varTable = (tx as any).table('variables');
        for (const env of envs) {
          const vars = env.variables;
          if (Array.isArray(vars)) {
            for (const v of vars) {
              if (v && v.key) {
                await varTable.put({
                  id: v.id || Math.random().toString(36).slice(2),
                  key: v.key,
                  initialValue: v.value || '',
                  currentValue: v.value || '',
                  enabled: v.enabled !== false,
                  secret: false,
                  scope: 'environment',
                  scopeId: env.id,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                });
              }
            }
          }
        }
      } catch {
        // First install — no data to migrate, just create the table
      }
    });
  }
}

export const db = new ApiPlaygroundDB();
