/**
 * Export API Playground collections to Postman v2.1.0 format
 */
import { Collection, CollectionItem, ApiRequest, AuthConfig, SavedResponse } from './types';

function convertAuth(auth: AuthConfig): any | undefined {
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: auth.token }] };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username },
          { key: 'password', value: auth.password },
        ],
      };
    case 'apikey':
      // Postman doesn't have a native apikey type, store as header
      return undefined; // handled in headers
    default:
      return undefined;
  }
}

function convertRequest(req: ApiRequest): any {
  const headers: any[] = [];
  for (const h of req.headers) {
    if (h.key) {
      headers.push({ key: h.key, value: h.value, disabled: !h.enabled });
    }
  }

  // Add API Key to headers if applicable
  if (req.auth.type === 'apikey' && req.auth.apiKeyName && req.auth.apiKeyIn === 'header') {
    headers.push({ key: req.auth.apiKeyName, value: req.auth.apiKey, disabled: false });
  }

  // Body
  let body: any = undefined;
  if (req.bodyType !== 'none') {
    if (req.bodyType === 'json' || req.bodyType === 'raw') {
      body = {
        mode: 'raw',
        raw: req.body,
        options: { raw: { language: req.bodyType === 'json' ? 'json' : 'text' } },
      };
    } else if (req.bodyType === 'x-www-form-urlencoded') {
      body = {
        mode: 'urlencoded',
        urlencoded: req.formData.filter(f => f.key).map(f => ({
          key: f.key, value: f.value, disabled: !f.enabled,
        })),
      };
    } else if (req.bodyType === 'form-data') {
      body = {
        mode: 'formdata',
        formdata: req.formData.filter(f => f.key).map(f => ({
          key: f.key, value: f.value, type: 'text', disabled: !f.enabled,
        })),
      };
    }
  }

  // URL
  const urlObj: { raw: string; host: string[]; path: string[]; query?: any[] } = { raw: req.url, host: [], path: [] };
  try {
    const url = new URL(req.url);
    urlObj.host = url.host.split('.');
    urlObj.path = url.pathname.split('/').filter(Boolean);
  } catch {
    // Not a full URL, keep as-is
  }

  // Auth
  const auth = convertAuth(req.auth);

  // Query params
  const query = req.params.filter(p => p.key).map(p => ({
    key: p.key, value: p.value, disabled: !p.enabled,
  }));

  return {
    method: req.method,
    header: headers,
    body,
    url: query.length > 0 ? { ...urlObj, query } : urlObj,
    auth,
  };
}

function convertSavedResponses(saved: SavedResponse[]): any[] {
  return saved.map(sr => ({
    name: sr.name,
    originalRequest: null,
    status: sr.statusText || String(sr.status),
    code: sr.status,
    header: Object.entries(sr.headers).map(([key, value]) => ({ key, value })),
    body: sr.body,
  }));
}

function convertItems(items: CollectionItem[]): any[] {
  return items.map(item => {
    if (item.type === 'folder') {
      return {
        name: item.name,
        item: convertItems(item.items),
      };
    }
    return {
      name: item.request.name,
      request: convertRequest(item.request),
      response: convertSavedResponses(item.request.savedResponses || []),
    };
  });
}

/**
 * Export collections to Postman v2.1.0 compatible JSON string
 */
export function exportToPostman(collections: Collection[], name?: string): string {
  const postmanCollection = {
    info: {
      _postman_id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      name: name || collections[0]?.name || 'Exported Collection',
      description: 'Exported from API Playground',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: collections.flatMap(col => convertItems(col.items)),
    variable: collections[0]?.variables?.map(v => ({
      key: v.key, value: v.value, type: 'default',
    })) || [],
  };

  return JSON.stringify(postmanCollection, null, 2);
}
