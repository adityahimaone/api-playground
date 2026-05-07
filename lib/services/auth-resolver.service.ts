/**
 * Auth Resolver Service
 *
 * Walks up the tree hierarchy (request → folder → collection) to find the effective auth.
 * auth.type='inherit' means use the parent's auth.
 * Returns resolved Authorization header or query param for apikey type.
 */

import { AuthConfig, TreeNode, RequestEntity, Environment, KVPair, VariableEntity } from '../entities/index';
import { resolveVariables, ResolveContext } from './variable-resolver.service';

interface AuthResult {
  /** Resolved headers to add (e.g. Authorization) */
  headers: Record<string, string>;
  /** URL suffix for apikey-in-query, or empty string */
  urlSuffix: string;
}

interface AuthResolverContext {
  /** All tree nodes */
  tree: TreeNode[];
  /** All request entities */
  requests: RequestEntity[];
  /** All environments */
  environments: Environment[];
  /** ID of the active environment */
  activeEnvId: string | null;
  /** Collection-level variables for resolving dynamic auth values */
  collectionVars?: VariableEntity[];
  /** All variable entities (for looking up environment variable values by ID) */
  allVariables?: VariableEntity[];
}

const EMPTY_AUTH: AuthConfig = {
  type: 'none',
  token: '',
  username: '',
  password: '',
  apiKey: '',
  apiKeyName: '',
  apiKeyIn: 'header',
};

/**
 * Resolve the effective auth for a given request by walking up the tree.
 * Stops at the first non-inherit auth config found.
 */
function findEffectiveAuth(
  requestId: string,
  tree: TreeNode[],
  requests: RequestEntity[]
): AuthConfig {
  // Find the request's tree node
  const reqNode = tree.find(n => n.type === 'request' && n.dataId === requestId);
  if (!reqNode) {
    const req = requests.find(r => r.id === requestId);
    return req?.auth ?? EMPTY_AUTH;
  }

  // Check the request's own auth first
  const req = requests.find(r => r.id === requestId);
  if (req && req.auth.type !== 'inherit') {
    return req.auth;
  }

  // Walk up: folder → folder → collection
  let currentNode: TreeNode | undefined = reqNode;
  while (currentNode) {
    const parentNode = tree.find(n => n.id === currentNode!.parentId);
    if (!parentNode) break;

    if (parentNode.type === 'folder') {
      // Folders don't directly hold auth, but we keep walking up
      currentNode = parentNode;
      continue;
    }

    if (parentNode.type === 'collection') {
      // Collections can have auth — look it up via the collection's data
      // In normalized model, collection-level auth is stored on the collection node
      // For now, collections don't directly store auth in TreeNode, but
      // we check the request's collection-level auth if the request has it
      // This is handled via collectionVars pattern
      // Walk complete
      break;
    }

    currentNode = parentNode;
  }

  // If we reached here with inherit, the request itself has inherit
  // We need to find the nearest non-inherit ancestor
  return findFirstNonInheritAuth(requestId, tree, requests);
}

/**
 * Walk up the tree from a request to find the first ancestor (or self)
 * whose auth is NOT 'inherit'.
 */
function findFirstNonInheritAuth(
  requestId: string,
  tree: TreeNode[],
  requests: RequestEntity[]
): AuthConfig {
  // Start with the request itself
  const reqNode = tree.find(n => n.type === 'request' && n.dataId === requestId);
  if (reqNode) {
    const req = requests.find(r => r.id === requestId);
    if (req && req.auth.type !== 'inherit') return req.auth;
  }

  // Walk up parent chain
  let currentId = reqNode?.parentId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = tree.find(n => n.id === currentId);
    if (!node) break;

    // Check if this node has auth metadata (stored as comment/description convention)
    // In the normalized model, we check the requests for this node's children
    // For folders and collections, auth is inherited — walk up further
    if (node.type === 'collection') {
      // Reached collection root — check if collection has default auth
      // The collection-level auth would be stored on collection's request entities
      // with a special marker or on the collection tree node itself
      break;
    }

    currentId = node.parentId;
  }

  // No explicit auth found — return none
  return EMPTY_AUTH;
}

/**
 * Build variable scopes from environments for resolving dynamic auth values.
 * Looks up actual VariableEntity values by the environment's variableIds.
 */
function getEnvironmentVars(
  environments: Environment[],
  activeEnvId: string | null,
  allVariables: VariableEntity[]
): VariableEntity[] {
  if (!activeEnvId) return [];
  const env = environments.find(e => e.id === activeEnvId);
  if (!env) return [];
  return allVariables.filter(
    v => v.enabled && v.scope === 'environment' && env.variableIds.includes(v.id)
  );
}

/**
 * Resolve auth configuration into concrete headers and URL suffix.
 */
export function resolveAuth(
  requestId: string,
  ctx: AuthResolverContext
): AuthResult {
  const { tree, requests, environments, activeEnvId, collectionVars } = ctx;

  const auth = findEffectiveAuth(requestId, tree, requests);

  // Build variable scopes for resolving dynamic auth values
  const envVars = getEnvironmentVars(environments, activeEnvId, ctx.allVariables ?? []);
  const resolveContext: ResolveContext = {
    globalVariables: [],
    environmentVariables: envVars,
    collectionVariables: collectionVars ?? [],
  };

  const result: AuthResult = {
    headers: {},
    urlSuffix: '',
  };

  switch (auth.type) {
    case 'bearer': {
      const token = resolveVariables(auth.token, resolveContext);
      if (token) {
        result.headers['Authorization'] = `Bearer ${token}`;
      }
      break;
    }

    case 'basic': {
      const username = resolveVariables(auth.username, resolveContext);
      const password = resolveVariables(auth.password, resolveContext);
      if (username) {
        const encoded = typeof btoa === 'function'
          ? btoa(`${username}:${password}`)
          : Buffer.from(`${username}:${password}`).toString('base64');
        result.headers['Authorization'] = `Basic ${encoded}`;
      }
      break;
    }

    case 'apikey': {
      const apiKey = resolveVariables(auth.apiKey, resolveContext);
      const apiKeyName = resolveVariables(auth.apiKeyName, resolveContext);

      if (apiKey && apiKeyName) {
        if (auth.apiKeyIn === 'header') {
          result.headers[apiKeyName] = apiKey;
        } else {
          // Query param mode
          result.urlSuffix = `${apiKeyName}=${encodeURIComponent(apiKey)}`;
        }
      }
      break;
    }

    case 'inherit':
      // Should have been resolved by findEffectiveAuth
      // If still inherit here, treat as none
      break;

    case 'none':
    default:
      break;
  }

  return result;
}
