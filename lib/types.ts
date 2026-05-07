export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KVPair {
  key: string;
  value: string;
  enabled: boolean;
  id: string;
}

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KVPair[];
  headers: KVPair[];
  bodyType: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw';
  body: string;
  formData: KVPair[];
  auth: AuthConfig;
  savedResponses: SavedResponse[];
}

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  token: string;
  username: string;
  password: string;
  apiKey: string;
  apiKeyName: string;
  apiKeyIn: 'header' | 'query';
}

export interface SavedResponse {
  id: string;
  name: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

// ── Multi-tab ──
export interface Tab {
  id: string;
  request: ApiRequest;
  name: string;
  hasChanges: boolean;
}

// ── Context menu ──
export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetType: 'collection' | 'folder' | 'request';
  targetId: string;
  collectionId: string;
  parentFolderId: string | null;
}

// ── Tree-based collection items ──
export interface CollectionFolder {
  type: 'folder';
  id: string;
  name: string;
  items: CollectionItem[];
}

export interface CollectionRequestItem {
  type: 'request';
  id: string;
  request: ApiRequest;
}

export type CollectionItem = CollectionFolder | CollectionRequestItem;

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
  variables: KVPair[];
  auth?: AuthConfig; // collection-level auth (inherited by children)
}

export interface Workspace {
  id: string;
  name: string;
  collections: Collection[];
  createdAt: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: KVPair[];
}

export interface HistoryEntry {
  id: string;
  request: ApiRequest;
  response: ApiResponse;
  timestamp: string;
}

export const DEFAULT_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'var(--method-get)',
  POST: 'var(--method-post)',
  PUT: 'var(--method-put)',
  PATCH: 'var(--method-patch)',
  DELETE: 'var(--method-delete)',
  HEAD: 'var(--method-head)',
  OPTIONS: 'var(--method-options)',
};

export const METHOD_BG: Record<HttpMethod, string> = {
  GET: '#3b82f615', POST: '#22c55e15', PUT: '#f9731615', PATCH: '#eab30815',
  DELETE: '#ef444415', HEAD: '#8b5cf615', OPTIONS: '#6b728015',
};

const genId = () => Math.random().toString(36).slice(2, 10);

export function createKVPair(key = '', value = '', enabled = true): KVPair {
  return { key, value, enabled, id: genId() };
}

export function createRequest(name = 'New Request'): ApiRequest {
  return {
    id: genId(), name, method: 'GET', url: '',
    params: [createKVPair()], headers: [createKVPair()],
    bodyType: 'none', body: '', formData: [createKVPair()],
    auth: { type: 'none', token: '', username: '', password: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header' },
    savedResponses: [],
  };
}

export function createFolder(name: string): CollectionFolder {
  return { type: 'folder', id: genId(), name, items: [] };
}

export function createRequestItem(request: ApiRequest): CollectionRequestItem {
  return { type: 'request', id: genId(), request };
}

export function createWorkspace(name: string): Workspace {
  return { id: genId(), name, collections: [], createdAt: new Date().toISOString() };
}

export function createSavedResponse(name: string, status: number, statusText: string, headers: Record<string, string>, body: string): SavedResponse {
  return { id: genId(), name, status, statusText, headers, body };
}

/** Detect path variables like :id, :name in URL */
export function extractPathVariables(url: string): string[] {
  const matches = url.match(/:([a-zA-Z_][\w]*)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.slice(1))));
}

/** Deep clone a request (for duplicate, tabs, etc) */
export function cloneRequest(req: ApiRequest): ApiRequest {
  return JSON.parse(JSON.stringify(req));
}

/** Flatten tree items for search */
export function flattenItems(items: CollectionItem[]): Array<{ item: CollectionItem; collectionId: string; path: string }> {
  const result: Array<{ item: CollectionItem; collectionId: string; path: string }> = [];
  const walk = (arr: CollectionItem[], path: string) => {
    for (const item of arr) {
      if (item.type === 'folder') {
        result.push({ item, collectionId: '', path: path ? `${path} / ${item.name}` : item.name });
        walk(item.items, path ? `${path} / ${item.name}` : item.name);
      } else {
        result.push({ item, collectionId: '', path: path ? `${path} / ${item.request.name}` : item.request.name });
      }
    }
  };
  walk(items, '');
  return result;
}
