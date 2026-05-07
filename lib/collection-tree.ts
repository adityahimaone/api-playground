/**
 * Tree utilities for CollectionFolder operations
 */
import { CollectionItem, CollectionFolder, ApiRequest, createRequest, cloneRequest } from './types';

const genId = () => Math.random().toString(36).slice(2, 10);

/** Find an item in a tree by ID */
export function findItem(items: CollectionItem[], id: string): CollectionItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.type === 'folder') {
      const found = findItem(item.items, id);
      if (found) return found;
    }
  }
  return null;
}

/** Find parent folder that contains the given ID */
export function findParent(items: CollectionItem[], id: string): CollectionFolder | null {
  for (const item of items) {
    if (item.type === 'folder') {
      if (item.items.some(child => child.id === id)) return item;
      const found = findParent(item.items, id);
      if (found) return found;
    }
  }
  return null;
}

/** Add an item to collection root */
export function addItem(items: CollectionItem[], item: CollectionItem): CollectionItem[] {
  return [...items, item];
}

/** Add an item inside a specific folder */
export function addItemToFolder(items: CollectionItem[], folderId: string, item: CollectionItem): CollectionItem[] {
  return items.map(i => {
    if (i.type === 'folder' && i.id === folderId) {
      return { ...i, items: [...i.items, item] };
    }
    if (i.type === 'folder') {
      return { ...i, items: addItemToFolder(i.items, folderId, item) };
    }
    return i;
  });
}

/** Remove an item by ID */
export function removeItem(items: CollectionItem[], id: string): CollectionItem[] {
  return items.filter(i => i.id !== id).map(i => {
    if (i.type === 'folder') {
      return { ...i, items: removeItem(i.items, id) };
    }
    return i;
  });
}

/** Rename an item */
export function renameItem(items: CollectionItem[], id: string, name: string): CollectionItem[] {
  return items.map(i => {
    if (i.id === id) {
      if (i.type === 'folder') return { ...i, name };
      return { ...i, request: { ...i.request, name } };
    }
    if (i.type === 'folder') {
      return { ...i, items: renameItem(i.items, id, name) };
    }
    return i;
  });
}

/** Duplicate an item (recursive for folders) */
export function duplicateItem(items: CollectionItem[], id: string): CollectionItem[] {
  const original = findItem(items, id);
  if (!original) return items;

  const dup = duplicateItemInner(original);
  // Insert after the original
  return items.reduce<CollectionItem[]>((acc, item) => {
    acc.push(item);
    if (item.id === id) acc.push(dup);
    return acc;
  }, []);
}

function duplicateItemInner(item: CollectionItem): CollectionItem {
  const newId = () => Math.random().toString(36).slice(2, 10);
  if (item.type === 'folder') {
    return {
      type: 'folder',
      id: newId(),
      name: `${item.name} (Copy)`,
      items: item.items.map(child => duplicateItemInner(child)),
    };
  }
  return {
    type: 'request',
    id: newId(),
    request: {
      ...cloneRequest(item.request),
      id: newId(),
      name: `${item.request.name} (Copy)`,
    },
  };
}

/** Move an item to a different position in the tree */
export function moveItem(
  items: CollectionItem[],
  itemId: string,
  targetFolderId: string | null, // null = root level
  targetIndex: number
): CollectionItem[] {
  // 1. Find and extract the item
  let extracted: CollectionItem | null = null;
  const withoutItem = removeItem(items, itemId);
  // Recalculate after removal
  const found = (() => {
    // After removal, we need to find the extracted item
    // We'll re-extract from the original
    const searchOriginal = (arr: CollectionItem[]): CollectionItem | null => {
      for (const i of arr) {
        if (i.id === itemId) return i;
        if (i.type === 'folder') {
          const found = searchOriginal(i.items);
          if (found) return found;
        }
      }
      return null;
    };
    return searchOriginal(items);
  })();

  if (!found) return items;
  extracted = found;

  // 2. Insert at target position
  if (targetFolderId === null) {
    // Insert at root level
    const clone = [...withoutItem];
    clone.splice(targetIndex, 0, extracted);
    return clone;
  }

  // Insert into target folder
  return withoutItem.map(i => {
    if (i.type === 'folder' && i.id === targetFolderId) {
      const newItems = [...i.items];
      newItems.splice(targetIndex, 0, extracted!);
      return { ...i, items: newItems };
    }
    if (i.type === 'folder') {
      return { ...i, items: moveItem(i.items, itemId, targetFolderId, targetIndex) };
    }
    return i;
  });
}

/** Count all requests in a tree */
export function countRequests(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === 'request') count++;
    if (item.type === 'folder') count += countRequests(item.items);
  }
  return count;
}
