/**
 * Postman v2.1.0 Export Service
 *
 * Reconstructs nested tree from flat treeNodes and exports
 * as Postman Collection v2.1.0 compatible JSON.
 * Exports request bodies, auth, and saved responses.
 */

import {
  TreeNode,
  RequestEntity,
  ResponseExample,
  AuthConfig,
  RequestBody,
} from '../entities/index';

// ── Postman output types ──

interface PostmanExportItem {
  name: string;
  request?: any;
  item?: PostmanExportItem[];
  response?: any[];
}

interface PostmanExportCollection {
  info: {
    _postman_id: string;
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanExportItem[];
  variable?: Array<{ key: string; value: string; type: string }>;
}

// ── Auth Conversion ──

function convertAuth(auth: AuthConfig): any | undefined {
  switch (auth.type) {
    case 'bearer':
      return {
        type: 'bearer',
        bearer: [{ key: 'token', value: auth.token }],
      };

    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username },
          { key: 'password', value: auth.password },
        ],
      };

    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.apiKeyName },
          { key: 'value', value: auth.apiKey },
          { key: 'in', value: auth.apiKeyIn },
        ],
      };

    case 'inherit':
      // Inherit is an internal concept — export as no auth
      return undefined;

    case 'none':
    default:
      return undefined;
  }
}

// ── Body Conversion ──

function convertBody(body: RequestBody, headers: Array<{ key: string; value: string; enabled: boolean }>): any | undefined {
  switch (body.mode) {
    case 'none':
      return undefined;

    case 'json':
      return {
        mode: 'raw',
        raw: body.content,
        options: { raw: { language: 'json' } },
      };

    case 'raw':
      return {
        mode: 'raw',
        raw: body.content,
        options: { raw: { language: 'text' } },
      };

    case 'x-www-form-urlencoded': {
      const pairs = (body.formData || [])
        .filter(f => f.key)
        .map(f => ({
          key: f.key,
          value: f.value,
          disabled: !f.enabled,
        }));
      return {
        mode: 'urlencoded',
        urlencoded: pairs,
      };
    }

    case 'form-data': {
      const pairs = (body.formData || [])
        .filter(f => f.key)
        .map(f => ({
          key: f.key,
          value: f.value,
          type: 'text',
          disabled: !f.enabled,
        }));
      return {
        mode: 'formdata',
        formdata: pairs,
      };
    }

    default:
      return undefined;
  }
}

// ── URL Conversion ──

function convertUrl(
  url: string,
  params: Array<{ key: string; value: string; enabled: boolean }>
): any {
  const urlObj: any = { raw: url };

  try {
    const parsed = new URL(url);
    urlObj.protocol = parsed.protocol.replace(':', '');
    urlObj.host = parsed.hostname.split('.');
    urlObj.path = parsed.pathname.split('/').filter(Boolean);
    if (parsed.port) {
      urlObj.port = parsed.port;
    }
  } catch {
    // Not a full URL — keep raw only
    // Try to extract path segments
    const segments = url.split('/').filter(Boolean);
    if (segments.length > 0) {
      urlObj.path = segments;
    }
  }

  // Query params
  const queryParams = params
    .filter(p => p.key && !p.key.startsWith(':'))
    .map(p => ({
      key: p.key,
      value: p.value,
      disabled: !p.enabled,
    }));

  if (queryParams.length > 0) {
    urlObj.query = queryParams;
  }

  return urlObj;
}

// ── Request Conversion ──

function convertRequest(
  request: RequestEntity,
  responses: ResponseExample[]
): any {
  // Headers
  const headers: any[] = (request.headers || [])
    .filter(h => h.key)
    .map(h => ({
      key: h.key,
      value: h.value,
      disabled: !h.enabled,
    }));

  // Body
  const body = convertBody(request.body, request.headers);

  // URL with query params
  const url = convertUrl(request.url, request.params || []);

  // Auth
  const auth = convertAuth(request.auth);

  // Saved responses
  const savedResponses = responses.map(r => ({
    name: r.name,
    status: r.statusText || String(r.status),
    code: r.status,
    header: Object.entries(r.headers).map(([key, value]) => ({ key, value })),
    body: r.body,
  }));

  return {
    method: request.method,
    header: headers,
    body,
    url,
    auth,
    // Note: Postman's originalRequest would be the same structure
    // but we don't store it separately
  };
}

// ── Recursive Item Conversion ──

function convertNodeToPostmanItem(
  node: TreeNode,
  nodeMap: Map<string, TreeNode>,
  requestMap: Map<string, RequestEntity>,
  responseMap: Map<string, ResponseExample[]>
): PostmanExportItem | null {
  if (node.type === 'collection') {
    // Collections are handled at the top level, not as items
    return null;
  }

  if (node.type === 'folder') {
    const children = node.childrenIds
      .map(id => nodeMap.get(id))
      .filter((n): n is TreeNode => !!n)
      .sort((a, b) => a.order - b.order);

    const childItems = children
      .map(child => convertNodeToPostmanItem(child, nodeMap, requestMap, responseMap))
      .filter((item): item is PostmanExportItem => !!item);

    return {
      name: node.name,
      item: childItems,
    };
  }

  if (node.type === 'request' && node.dataId) {
    const request = requestMap.get(node.dataId);
    if (!request) return null;

    const responses = responseMap.get(node.dataId) || [];

    return {
      name: node.name,
      request: convertRequest(request, responses),
      response: responses.map(r => ({
        name: r.name,
        status: r.statusText || String(r.status),
        code: r.status,
        header: Object.entries(r.headers).map(([key, value]) => ({ key, value })),
        body: r.body,
      })),
    };
  }

  return null;
}

// ── Public API ──

/**
 * Export normalized entities to a Postman v2.1.0 compatible JSON string.
 *
 * Reconstructs the nested tree from flat treeNodes and maps
 * each request + its responses into Postman format.
 */
export function exportToPostman(
  treeNodes: TreeNode[],
  requests: RequestEntity[],
  responses: ResponseExample[]
): string {
  // Build lookup maps for O(1) access
  const nodeMap = new Map<string, TreeNode>();
  for (const node of treeNodes) {
    nodeMap.set(node.id, node);
  }

  const requestMap = new Map<string, RequestEntity>();
  for (const req of requests) {
    requestMap.set(req.id, req);
  }

  // Group responses by requestId
  const responseMap = new Map<string, ResponseExample[]>();
  for (const resp of responses) {
    const existing = responseMap.get(resp.requestId) || [];
    existing.push(resp);
    responseMap.set(resp.requestId, existing);
  }

  // Find collection root nodes
  const collectionNodes = treeNodes.filter(n => n.type === 'collection');

  // Build Postman items from collection children
  const postmanItems: PostmanExportItem[] = [];

  for (const collection of collectionNodes) {
    const children = collection.childrenIds
      .map(id => nodeMap.get(id))
      .filter((n): n is TreeNode => !!n)
      .sort((a, b) => a.order - b.order);

    for (const child of children) {
      const item = convertNodeToPostmanItem(child, nodeMap, requestMap, responseMap);
      if (item) {
        postmanItems.push(item);
      }
    }
  }

  // If no collection node found, try root-level nodes
  if (postmanItems.length === 0) {
    const rootNodes = treeNodes
      .filter(n => n.parentId === null && n.type !== 'collection')
      .sort((a, b) => a.order - b.order);

    for (const node of rootNodes) {
      const item = convertNodeToPostmanItem(node, nodeMap, requestMap, responseMap);
      if (item) {
        postmanItems.push(item);
      }
    }
  }

  // Build the Postman collection
  const collectionName = collectionNodes[0]?.name || 'Exported Collection';

  const postmanCollection: PostmanExportCollection = {
    info: {
      _postman_id: generateUUID(),
      name: collectionName,
      description: 'Exported from API Playground',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: postmanItems,
  };

  return JSON.stringify(postmanCollection, null, 2);
}

// ── UUID helper ──

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
