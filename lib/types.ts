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
  auth: {
    type: 'none' | 'bearer' | 'basic';
    token: string;
    username: string;
    password: string;
  };
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
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

const genId = () => Math.random().toString(36).slice(2, 10);

export function createKVPair(key = '', value = '', enabled = true): KVPair {
  return { key, value, enabled, id: genId() };
}

export function createRequest(name = 'New Request'): ApiRequest {
  return {
    id: genId(),
    name,
    method: 'GET',
    url: '',
    params: [createKVPair()],
    headers: [createKVPair()],
    bodyType: 'none',
    body: '',
    formData: [createKVPair()],
    auth: { type: 'none', token: '', username: '', password: '' },
  };
}

export function createFolder(name: string): CollectionFolder {
  return { type: 'folder', id: genId(), name, items: [] };
}

export function createRequestItem(request: ApiRequest): CollectionRequestItem {
  return { type: 'request', id: genId(), request };
}

export function createWorkspace(name: string): Workspace {
  return {
    id: genId(),
    name,
    collections: [],
    createdAt: new Date().toISOString(),
  };
}
