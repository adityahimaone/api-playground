import Dexie, { type Table } from 'dexie';
import type {
  TreeNode,
  RequestEntity,
  ResponseExample,
  Environment,
  HistoryEntry,
} from '../entities';

class ApiPlaygroundDB extends Dexie {
  treeNodes!: Table<TreeNode>;
  requests!: Table<RequestEntity>;
  responses!: Table<ResponseExample>;
  environments!: Table<Environment>;
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
  }
}

export const db = new ApiPlaygroundDB();
