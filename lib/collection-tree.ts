/**
 * Tree utilities for CollectionFolder ↔ flat operations
 */
import { CollectionItem, CollectionFolder, CollectionRequestItem } from './types';

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

/** Find the parent folder that contains the given ID */
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

/** Add an item to the collection root */
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

/** Count all requests in a tree */
export function countRequests(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === 'request') count++;
    if (item.type === 'folder') count += countRequests(item.items);
  }
  return count;
}
