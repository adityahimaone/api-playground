/**
 * Postman Collection v2.1.0 Importer
 * Converts Postman JSON format → API Playground tree-based format
 */

import {
  ApiRequest, Collection, CollectionItem, CollectionFolder, CollectionRequestItem,
  createKVPair, createRequest, createFolder, createRequestItem, HttpMethod, KVPair
} from './types';

// ── Postman v2.1.0 types (subset we need) ──

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
  type?: string;
}

interface PostmanBody {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'none' | 'binary' | 'graphql';
  raw?: string;
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>;
  formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean }>;
  options?: {
    raw?: {
      language?: string;
    };
  };
}

interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: Array<{ key: string; value: string; disabled?: boolean }>;
  variable?: Array<{ key: string; value: string }>;
}

interface PostmanRequest {
  method: string | string[];
  header?: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl | string;
  auth?: {
    type: string;
    bearer?: Array<{ key: string; value: string }>;
    basic?: Array<{ key: string; value: string }>;
  };
  description?: string;
}

interface PostmanResponse {
  name?: string;
  originalRequest?: PostmanRequest;
  status?: string;
  code?: number;
  body?: string;
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];  // nested folder
  request?: PostmanRequest;
  response?: PostmanResponse[];
}

interface PostmanCollection {
  info: {
    _postman_id?: string;
    name: string;
    description?: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: Array<{ key: string; value: string; type?: string }>;
  auth?: any;
}

// ── Helpers ──

function methodFromString(m: string | string[]): HttpMethod {
  const upper = (Array.isArray(m) ? m[0] : m).toUpperCase();
  const valid: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return valid.includes(upper as HttpMethod) ? upper as HttpMethod : 'GET';
}

function parseUrlToString(url: PostmanUrl | string): string {
  if (typeof url === 'string') return url;
  return url.raw || '';
}

function postmanHeadersToKV(headers?: PostmanHeader[]): KVPair[] {
  if (!headers || headers.length === 0) return [createKVPair()];
  return headers.map(h =>
    createKVPair(h.key || '', h.value || '', h.disabled !== true)
  );
}

function postmanParamsToKV(url: PostmanUrl | string): KVPair[] {
  if (typeof url === 'string') return [];
  if (!url.query || url.query.length === 0) return [];
  return url.query.map(q =>
    createKVPair(q.key || '', q.value || '', q.disabled !== true)
  );
}

function resolveBodyType(body?: PostmanBody): { bodyType: ApiRequest['bodyType']; body: string } {
  if (!body || body.mode === 'none') {
    return { bodyType: 'none', body: '' };
  }

  switch (body.mode) {
    case 'raw': {
      const raw = body.raw || '';
      const language = body.options?.raw?.language || '';
      if (language === 'json') {
        return { bodyType: 'json', body: raw };
      }
      return { bodyType: 'raw', body: raw };
    }

    case 'urlencoded': {
      const pairs = (body.urlencoded || [])
        .filter(p => p.disabled !== true)
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&');
      return { bodyType: 'x-www-form-urlencoded', body: pairs };
    }

    case 'formdata': {
      const formPairs = (body.formdata || [])
        .filter(p => p.disabled !== true)
        .map(p => createKVPair(p.key, p.value, true));
      return { bodyType: 'form-data', body: JSON.stringify(Object.fromEntries(formPairs.map(f => [f.key, f.value]))) };
    }

    default:
      return { bodyType: 'none', body: '' };
  }
}

function resolveAuth(auth?: PostmanRequest['auth']): ApiRequest['auth'] {
  if (!auth) return { type: 'none', token: '', username: '', password: '' };

  switch (auth.type) {
    case 'bearer': {
      const tokenEntry = auth.bearer?.find(b => b.key === 'token');
      return { type: 'bearer', token: tokenEntry?.value || '', username: '', password: '' };
    }
    case 'basic': {
      const userEntry = auth.basic?.find(b => b.key === 'username');
      const passEntry = auth.basic?.find(b => b.key === 'password');
      return { type: 'basic', token: '', username: userEntry?.value || '', password: passEntry?.value || '' };
    }
    default:
      return { type: 'none', token: '', username: '', password: '' };
  }
}

// ── Convert a Postman request to internal format ──

function convertPostmanRequest(req: PostmanRequest, name: string): ApiRequest {
  const urlStr = parseUrlToString(req.url);
  const { bodyType, body } = resolveBodyType(req.body);
  const auth = resolveAuth(req.auth);

  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    method: methodFromString(req.method),
    url: urlStr,
    params: postmanParamsToKV(req.url),
    headers: postmanHeadersToKV(req.header),
    bodyType,
    body,
    formData: [createKVPair()],
    auth,
  };
}

// ── Convert Postman items → tree-based CollectionItems ──

function convertPostmanItems(items: PostmanItem[]): CollectionItem[] {
  const result: CollectionItem[] = [];

  for (const item of items) {
    if (item.item && item.item.length > 0) {
      // This is a folder
      result.push({
        type: 'folder',
        id: Math.random().toString(36).slice(2, 10),
        name: item.name || 'Unnamed Folder',
        items: convertPostmanItems(item.item), // recurse
      });
    } else if (item.request) {
      // This is a request
      const apiReq = convertPostmanRequest(item.request, item.name || 'Imported Request');
      result.push(createRequestItem(apiReq));
    }
  }

  return result;
}

// ── Public API ──

export interface PostmanImportResult {
  success: boolean;
  collections: Collection[];
  variables: KVPair[];
  errors: string[];
  stats: {
    totalFolders: number;
    totalRequests: number;
    topLevelVariables: number;
  };
}

/**
 * Parse a Postman Collection v2.1.0 JSON string and convert to API Playground format.
 * Each top-level folder → one Collection (with nested tree structure).
 * Root requests → added to the first collection.
 */
export function importPostmanCollection(json: string): PostmanImportResult {
  const result: PostmanImportResult = {
    success: false,
    collections: [],
    variables: [],
    errors: [],
    stats: { totalFolders: 0, totalRequests: 0, topLevelVariables: 0 },
  };

  try {
    const data = JSON.parse(json);

    // Validate it's a Postman collection — be more lenient
    if (!data.info) {
      result.errors.push('Not a Postman collection — missing info object');
      return result;
    }

    if (!data.item || !Array.isArray(data.item) || data.item.length === 0) {
      result.errors.push('Not a Postman collection — missing or empty item array');
      return result;
    }

    // Convert collection-level variables
    if (data.variable && Array.isArray(data.variable)) {
      result.variables = data.variable.map((v: any) =>
        createKVPair(v.key || '', v.value || '', true)
      );
      result.stats.topLevelVariables = result.variables.length;
    }

    // Count items for stats
    function countPostmanItems(items: PostmanItem[]): { folders: number; requests: number } {
      let folders = 0;
      let requests = 0;
      for (const item of items) {
        if (item.item && item.item.length > 0) {
          folders++;
          const sub = countPostmanItems(item.item);
          folders += sub.folders;
          requests += sub.requests;
        } else if (item.request) {
          requests++;
        }
      }
      return { folders, requests };
    }

    const stats = countPostmanItems(data.item);
    result.stats.totalFolders = stats.folders;
    result.stats.totalRequests = stats.requests;

    // Convert all items to tree-based collection items
    const treeItems = convertPostmanItems(data.item);

    // Wrap in a single collection
    result.collections.push({
      id: Math.random().toString(36).slice(2, 10),
      name: data.info.name || 'Imported Collection',
      items: treeItems,
      variables: result.variables,
    });

    result.success = true;
  } catch (err: any) {
    result.errors.push(`Parse error: ${err.message}`);
  }

  return result;
}

/**
 * Detect if a JSON string looks like a Postman collection
 * Be lenient — check for info + item array pattern
 */
export function isPostmanCollection(json: string): boolean {
  try {
    const data = JSON.parse(json);
    // Check for Postman structure: info object with name, item array
    return !!(data.info && data.item && Array.isArray(data.item));
  } catch {
    return false;
  }
}
