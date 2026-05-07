import { db } from '../storage/dexie';
import type { TreeNode, NodeType } from '../entities';

const table = () => db.treeNodes;

export const nodeRepository = {
  async getAll(): Promise<TreeNode[]> {
    return table().toArray();
  },

  async getById(id: string): Promise<TreeNode | undefined> {
    return table().get(id);
  },

  async getByParentId(parentId: string | null): Promise<TreeNode[]> {
    return table().where('parentId').equals(parentId as any).toArray();
  },

  async getRootNodes(): Promise<TreeNode[]> {
    return table().where('parentId').equals(null as any).toArray();
  },

  async getByType(type: NodeType): Promise<TreeNode[]> {
    return table().where('type').equals(type).toArray();
  },

  async getChildren(parentId: string): Promise<TreeNode[]> {
    return table().where('parentId').equals(parentId).sortBy('order');
  },

  async create(node: TreeNode): Promise<string> {
    return table().add(node);
  },

  async update(id: string, changes: Partial<TreeNode>): Promise<number> {
    return table().update(id, changes);
  },

  async delete(id: string): Promise<void> {
    return table().delete(id);
  },

  async bulkCreate(nodes: TreeNode[]): Promise<void> {
    await table().bulkAdd(nodes);
  },

  async bulkDelete(ids: string[]): Promise<void> {
    await table().bulkDelete(ids);
  },

  async getDescendants(nodeId: string): Promise<string[]> {
    const descendants: string[] = [];
    const children = await table().where('parentId').equals(nodeId).toArray();

    for (const child of children) {
      descendants.push(child.id);
      const childDescendants = await this.getDescendants(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  },

  async moveNode(nodeId: string, newParentId: string | null, newOrder: number): Promise<void> {
    await table().update(nodeId, {
      parentId: newParentId as any,
      order: newOrder,
    });
  },
};
