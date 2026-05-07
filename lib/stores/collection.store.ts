import { create } from 'zustand';
import {
  TreeNode,
  NodeType,
  createTreeNode,
  createRequestEntity,
} from '../entities';

interface CollectionState {
  treeNodes: Record<string, TreeNode>;
  rootIds: string[];
}

interface CollectionActions {
  loadTree: (nodes: TreeNode[]) => void;
  createNode: (
    type: NodeType,
    name: string,
    parentId?: string | null
  ) => TreeNode;
  deleteNode: (id: string) => void;
  renameNode: (id: string, name: string) => void;
  moveNode: (id: string, newParentId: string | null, newOrder: number) => void;
  getNodeChildren: (parentId: string | null) => TreeNode[];
  getDescendantIds: (id: string) => string[];
  getTreeNode: (id: string) => TreeNode | undefined;
}

type CollectionStore = CollectionState & CollectionActions;

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  treeNodes: {},
  rootIds: [],

  loadTree: (nodes) => {
    const map: Record<string, TreeNode> = {};
    const rootIds: string[] = [];

    for (const node of nodes) {
      map[node.id] = node;
      if (node.parentId === null) {
        rootIds.push(node.id);
      }
    }

    set({ treeNodes: map, rootIds });
  },

  createNode: (type, name, parentId = null) => {
    const { treeNodes, rootIds } = get();
    const parent = parentId ? treeNodes[parentId] : null;
    const siblings = parent
      ? parent.childrenIds.map((id) => treeNodes[id])
      : rootIds.map((id) => treeNodes[id]);
    const maxOrder = siblings.reduce(
      (max, s) => (s && s.order > max ? s.order : max),
      -1
    );

    const newNode = createTreeNode(type, name, parentId, maxOrder + 1);

    // For request nodes, also create a RequestEntity and link it
    if (type === 'request') {
      const req = createRequestEntity(name);
      newNode.dataId = req.id;
      // Store the request entity in the request store will be handled by the caller
      // But we can import and call it here for convenience
      // Actually, let's keep stores decoupled — caller creates both
    }

    set((state) => {
      const newTreeNodes = { ...state.treeNodes, [newNode.id]: newNode };

      if (parentId && newTreeNodes[parentId]) {
        newTreeNodes[parentId] = {
          ...newTreeNodes[parentId],
          childrenIds: [...newTreeNodes[parentId].childrenIds, newNode.id],
        };
      }

      const newRootIds =
        parentId === null ? [...state.rootIds, newNode.id] : state.rootIds;

      return { treeNodes: newTreeNodes, rootIds: newRootIds };
    });

    return newNode;
  },

  deleteNode: (id) => {
    const { treeNodes, rootIds } = get();
    const node = treeNodes[id];
    if (!node) return;

    // Collect all descendant IDs (recursive)
    const toDelete: string[] = [];
    const collect = (nodeId: string) => {
      toDelete.push(nodeId);
      const n = treeNodes[nodeId];
      if (n) {
        for (const childId of n.childrenIds) {
          collect(childId);
        }
      }
    };
    collect(id);

    set((state) => {
      const newTreeNodes = { ...state.treeNodes };

      // Remove all deleted nodes
      for (const delId of toDelete) {
        delete newTreeNodes[delId];
      }

      // Remove from parent's childrenIds
      if (node.parentId && newTreeNodes[node.parentId]) {
        newTreeNodes[node.parentId] = {
          ...newTreeNodes[node.parentId],
          childrenIds: newTreeNodes[node.parentId].childrenIds.filter(
            (cid) => cid !== id
          ),
        };
      }

      // Remove from rootIds if root node
      const newRootIds = state.rootIds.filter((rid) => rid !== id);

      return { treeNodes: newTreeNodes, rootIds: newRootIds };
    });
  },

  renameNode: (id, name) => {
    set((state) => {
      const node = state.treeNodes[id];
      if (!node) return state;
      return {
        treeNodes: {
          ...state.treeNodes,
          [id]: { ...node, name },
        },
      };
    });
  },

  moveNode: (id, newParentId, newOrder) => {
    const { treeNodes } = get();
    const node = treeNodes[id];
    if (!node) return;

    const oldParentId = node.parentId;

    set((state) => {
      const newTreeNodes = { ...state.treeNodes };

      // Remove from old parent
      if (oldParentId && newTreeNodes[oldParentId]) {
        newTreeNodes[oldParentId] = {
          ...newTreeNodes[oldParentId],
          childrenIds: newTreeNodes[oldParentId].childrenIds.filter(
            (cid) => cid !== id
          ),
        };
      }

      // Insert into new parent at specified order
      if (newParentId && newTreeNodes[newParentId]) {
        const newChildren = [...newTreeNodes[newParentId].childrenIds];
        newChildren.splice(newOrder, 0, id);
        newTreeNodes[newParentId] = {
          ...newTreeNodes[newParentId],
          childrenIds: newChildren,
        };
      }

      // Update the moved node
      newTreeNodes[id] = {
        ...newTreeNodes[id],
        parentId: newParentId,
        order: newOrder,
      };

      // Handle rootIds
      let newRootIds = [...state.rootIds];
      if (oldParentId === null) {
        newRootIds = newRootIds.filter((rid) => rid !== id);
      }
      if (newParentId === null) {
        newRootIds.splice(newOrder, 0, id);
      }

      return { treeNodes: newTreeNodes, rootIds: newRootIds };
    });
  },

  getNodeChildren: (parentId) => {
    const { treeNodes, rootIds } = get();

    if (parentId === null) {
      return rootIds
        .map((id) => treeNodes[id])
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
    }

    const parent = treeNodes[parentId];
    if (!parent) return [];

    return parent.childrenIds
      .map((id) => treeNodes[id])
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
  },

  getDescendantIds: (id) => {
    const { treeNodes } = get();
    const result: string[] = [];

    const traverse = (nodeId: string) => {
      const node = treeNodes[nodeId];
      if (!node) return;
      for (const childId of node.childrenIds) {
        result.push(childId);
        traverse(childId);
      }
    };

    traverse(id);
    return result;
  },

  getTreeNode: (id) => {
    return get().treeNodes[id];
  },
}));
