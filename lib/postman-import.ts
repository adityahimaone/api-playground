/**
 * Postman Collection v2.1.0 Importer
 * Converts Postman JSON format → API Playground tree-based format
 * Handles: nested folders, saved responses (response[]), auth, variables
 */

import {
  ApiRequest, Collection, CollectionItem, SavedResponse,
  createKVPair, createRequestItem, createFolder, createSavedResponse, HttpMethod, KVPair
} from './types';

// ── Postman types (subset) ──

interface PostmanHeader { key: string; value: string; disabled?: boolean; }
interface PostmanBody {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'none' | 'binary' | 'graphql';
  raw?: string;
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>;
  formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean }>;
  options?: { raw?: { language?: string } };
}
interface PostmanUrl {
  raw: string;
  host?: string[];
  path?: string[];
  query?: Array<{ key: string; value: string; disabled?: boolean }>;
}
interface PostmanRequest {
  method: string | string[];
  header?: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl | string;
  auth?: { type: string; bearer?: Array<{ key: string; value: string }>; basic?: Array<{ key: string; value: string }> };
}
interface PostmanResponse {
  name?: string;
  originalRequest?: PostmanRequest;
  status?: string;
  code?: number;
  header?: PostmanHeader[];
  body?: string;
}
interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: PostmanResponse[];
}
interface PostmanCollection {
  info: { _postman_id?: string; name: string; schema: string };
  item: PostmanItem[];
  variable?: Array<{ key: string; value: string; type?: string }>;
}

// ── Helpers ──

function methodFromString(m: string | string[]): HttpMethod {
  const upper = (Array.isArray(m) ? m[0] : m).toUpperCase();
  const valid: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return valid.includes(upper as HttpMethod) ? upper as HttpMethod : 'GET';
}

function parseUrl(url: PostmanUrl | string): string {
  return typeof url === 'string' ? url : url.raw || '';
}

function toKV(arr?: PostmanHeader[]): KVPair[] {
  if (!arr || arr.length === 0) return [createKVPair()];
  return arr.map(h => createKVPair(h.key || '', h.value || '', h.disabled !== true));
}

function toParams(url: PostmanUrl | string): KVPair[] {
  if (typeof url === 'string' || !url.query) return [];
  return url.query.map(q => createKVPair(q.key || '', q.value || '', q.disabled !== true));
}

function resolveBody(body?: PostmanBody): { bodyType: ApiRequest['bodyType']; body: string } {
  if (!body || body.mode === 'none') return { bodyType: 'none', body: '' };
  switch (body.mode) {
    case 'raw': {
      const lang = body.options?.raw?.language || '';
      return { bodyType: lang === 'json' ? 'json' : 'raw', body: body.raw || '' };
    }
    case 'urlencoded':
      return {
        bodyType: 'x-www-form-urlencoded',
        body: (body.urlencoded || []).filter(p => !p.disabled).map(p => `${p.key}=${p.value}`).join('&'),
      };
    case 'formdata':
      return {
        bodyType: 'form-data',
        body: JSON.stringify(Object.fromEntries((body.formdata || []).filter(p => !p.disabled).map(p => [p.key, p.value]))),
      };
    default:
      return { bodyType: 'none', body: '' };
  }
}

function resolveAuth(auth?: PostmanRequest['auth']): ApiRequest['auth'] {
  const def = { type: 'none' as const, token: '', username: '', password: '', apiKey: '', apiKeyName: '', apiKeyIn: 'header' as const };
  if (!auth) return def;
  if (auth.type === 'bearer') {
    return { ...def, type: 'bearer', token: auth.bearer?.find(b => b.key === 'token')?.value || '' };
  }
  if (auth.type === 'basic') {
    return {
      ...def, type: 'basic',
      username: auth.basic?.find(b => b.key === 'username')?.value || '',
      password: auth.basic?.find(b => b.key === 'password')?.value || '',
    };
  }
  return def;
}

function convertSavedResponses(responses?: PostmanResponse[]): SavedResponse[] {
  if (!responses || responses.length === 0) return [];
  return responses.map(r => {
    const headers: Record<string, string> = {};
    (r.header || []).forEach(h => { headers[h.key] = h.value; });
    return createSavedResponse(
      r.name || r.status || `Response ${r.code || ''}`,
      r.code || 0,
      r.status || '',
      headers,
      r.body || '',
    );
  });
}

function convertPostmanItems(items: PostmanItem[]): CollectionItem[] {
  const result: CollectionItem[] = [];
  for (const item of items) {
    if (item.item && item.item.length > 0) {
      result.push({
        type: 'folder',
        id: Math.random().toString(36).slice(2, 10),
        name: item.name || 'Unnamed Folder',
        items: convertPostmanItems(item.item),
      });
    } else if (item.request) {
      const req = item.request;
      const urlStr = parseUrl(req.url);
      const { bodyType, body } = resolveBody(req.body);
      const savedResponses = convertSavedResponses(item.response);
      const apiReq: ApiRequest = {
        id: Math.random().toString(36).slice(2, 10),
        name: item.name || 'Imported Request',
        method: methodFromString(req.method),
        url: urlStr,
        params: toParams(req.url),
        headers: toKV(req.header),
        bodyType,
        body,
        formData: [createKVPair()],
        auth: resolveAuth(req.auth),
        savedResponses,
      };
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
  stats: { totalFolders: number; totalRequests: number; totalSavedResponses: number };
}

export function importPostmanCollection(json: string): PostmanImportResult {
  const result: PostmanImportResult = {
    success: false, collections: [], variables: [], errors: [],
    stats: { totalFolders: 0, totalRequests: 0, totalSavedResponses: 0 },
  };

  try {
    const data = JSON.parse(json);
    if (!data.info || !data.item || !Array.isArray(data.item)) {
      result.errors.push('Not a Postman collection — missing info or item array');
      return result;
    }

    // Collection-level variables
    if (data.variable && Array.isArray(data.variable)) {
      result.variables = data.variable.map((v: any) => createKVPair(v.key || '', v.value || '', true));
    }

    // Count stats recursively
    const countItems = (items: PostmanItem[]): { folders: number; requests: number; saved: number } => {
      let f = 0, r = 0, s = 0;
      for (const item of items) {
        if (item.item && item.item.length > 0) {
          f++;
          const sub = countItems(item.item);
          f += sub.folders; r += sub.requests; s += sub.saved;
        } else if (item.request) {
          r++;
          s += (item.response || []).length;
        }
      }
      return { folders: f, requests: r, saved: s };
    }

    const stats = countItems(data.item);
    result.stats = { totalFolders: stats.folders, totalRequests: stats.requests, totalSavedResponses: stats.saved };

    // Convert to tree
    const treeItems = convertPostmanItems(data.item);
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

export function isPostmanCollection(json: string): boolean {
  try {
    const data = JSON.parse(json);
    return !!(data.info && data.item && Array.isArray(data.item));
  } catch {
    return false;
  }
}
