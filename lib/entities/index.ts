/**
 * Single source of truth for ALL entity types.
 * Normalized architecture: tree nodes are flat, data is separate.
 * Postman-like variable system with scopes and inheritance.
 */

// ═══ TREE NODE ═══
export type NodeType = 'collection' | 'folder' | 'request';

export interface TreeNode {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  childrenIds: string[];
  dataId?: string;
  order: number;
}

// ═══ VARIABLE ═══
export type VariableScope = 'global' | 'collection' | 'environment' | 'local' | 'runtime';

export interface VariableEntity {
  id: string;
  key: string;
  initialValue: string;
  currentValue: string;
  enabled: boolean;
  secret: boolean;
  scope: VariableScope;
  scopeId?: string; // FK: environmentId, collectionId, or tabId
  createdAt: number;
  updatedAt: number;
}

// ═══ REQUEST ═══
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KVPair {
  key: string;
  value: string;
  enabled: boolean;
  id: string;
}

export interface RequestBody {
  mode: 'none' | 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded';
  content: string;
  formData: KVPair[];
}

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey' | 'inherit';
  token: string;
  username: string;
  password: string;
  apiKey: string;
  apiKeyName: string;
  apiKeyIn: 'header' | 'query';
}

export interface RequestEntity {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KVPair[];
  headers: KVPair[];
  body: RequestBody;
  auth: AuthConfig;
  createdAt: number;
  updatedAt: number;
}

// ═══ RESPONSE EXAMPLE ═══
export interface ResponseExample {
  id: string;
  requestId: string;
  name: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  createdAt: number;
}

// ═══ ENVIRONMENT ═══
export interface Environment {
  id: string;
  name: string;
  color?: string;
  variableIds: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// ═══ HISTORY ═══
export interface HistoryEntry {
  id: string;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  time: number;
  size: number;
  requestSnapshotId?: string;
  timestamp: number;
}

// ═══ TAB ═══
export interface Tab {
  id: string;
  requestId: string;
  draftState: Partial<RequestEntity>;
  localVariableIds: string[];
  isDirty: boolean;
}

// ═══ APP STATE ═══
export interface AppState {
  activeWorkspaceId: string | null;
  activeEnvId: string | null;
  activeTabId: string | null;
  sidebarTab: 'collections' | 'history' | 'variables';
  theme: 'light' | 'dark';
  expandedNodeIds: string[];
  searchQuery: string;
}

// ═══ RUNTIME ═══
export interface ResolvedRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

// ═══ CONTEXT MENU ═══
export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeType: NodeType;
  nodeId: string;
}

// ═══ CONSTANTS ═══
export const DEFAULT_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#3b82f6', POST: '#22c55e', PUT: '#f97316', PATCH: '#eab308',
  DELETE: '#ef4444', HEAD: '#8b5cf6', OPTIONS: '#6b7280',
};

export const VARIABLE_SCOPE_COLORS: Record<VariableScope, string> = {
  global: '#6b7280',
  collection: '#8b5cf6',
  environment: '#3b82f6',
  local: '#f97316',
  runtime: '#22c55e',
};

// ═══ FACTORY FUNCTIONS ═══
const genId = () => Math.random().toString(36).slice(2, 10);

export function createKVPair(key = '', value = '', enabled = true): KVPair {
  return { key, value, enabled, id: genId() };
}

export function createVariableEntity(key = '', value = '', scope: VariableScope = 'global', scopeId?: string): VariableEntity {
  const now = Date.now();
  return {
    id: genId(), key,
    initialValue: value,
    currentValue: value,
    enabled: true,
    secret: false,
    scope,
    scopeId,
    createdAt: now, updatedAt: now,
  };
}

export function createTreeNode(type: NodeType, name: string, parentId: string | null = null, order = 0): TreeNode {
  return { id: genId(), parentId, type, name, childrenIds: [], dataId: undefined, order };
}

export function createRequestEntity(name = 'New Request'): RequestEntity {
  const now = Date.now();
  return {
    id: genId(), name, method: 'GET', url: '',
    params: [createKVPair()], headers: [createKVPair()],
    body: { mode: 'none', content: '', formData: [createKVPair()] },
    auth: { type: 'none', token: '', username: '', password: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header' },
    createdAt: now, updatedAt: now,
  };
}

export function createResponseExample(requestId: string, name: string, status: number, statusText: string, headers: Record<string, string>, body: string): ResponseExample {
  return { id: genId(), requestId, name, status, statusText, headers, body, createdAt: Date.now() };
}

export function createEnvironment(name: string, color?: string): Environment {
  return { id: genId(), name, color, variableIds: [], isActive: false, createdAt: Date.now(), updatedAt: Date.now() };
}

export function cloneRequest(req: RequestEntity): RequestEntity {
  return JSON.parse(JSON.stringify({ ...req, id: genId(), createdAt: Date.now(), updatedAt: Date.now() }));
}

export function extractPathVariables(url: string): string[] {
  const matches = url.match(/:([a-zA-Z_][\w]*)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.slice(1))));
}

/** Extract all {{variable}} names from a text string */
export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\s*[\w.-]+\s*)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim())));
}

/** Detect if a variable name is a dynamic variable */
export function isDynamicVariable(name: string): boolean {
  return name.startsWith('$');
}
