/**
 * Variable Resolution Service
 *
 * Resolution order: local < environment < collection < global (last wins)
 * Supports {{variable_name}} syntax with recursive resolution.
 * Handles :param path variables AND query params.
 */

import { KVPair } from '../entities/index';

interface VariableScopes {
  /** Local/draft variables (highest priority among named scopes) */
  globals?: KVPair[];
  /** Active environment variables */
  environment?: KVPair[];
  /** Collection-level variables */
  collectionVars?: KVPair[];
  /** Local request-level variables (lowest priority) */
  local?: KVPair[];
}

/**
 * Build a merged map from all scopes.
 * Later scopes override earlier ones for the same key.
 * Order: local < environment < collection < globals
 */
function buildVariableMap(scopes: VariableScopes): Map<string, string> {
  const map = new Map<string, string>();

  // Lowest priority first — each layer overwrites previous
  const layers: KVPair[][] = [
    scopes.local ?? [],
    scopes.environment ?? [],
    scopes.collectionVars ?? [],
    scopes.globals ?? [],
  ];

  for (const layer of layers) {
    for (const kv of layer) {
      if (kv.enabled && kv.key.trim()) {
        map.set(kv.key.trim(), kv.value);
      }
    }
  }

  return map;
}

/**
 * Resolve all {{variable_name}} occurrences in text.
 * Recursively resolves until no more placeholders remain (max 10 passes to avoid infinite loops).
 */
export function resolveVariables(
  text: string,
  scopes: VariableScopes
): string {
  if (!text) return text;

  const varMap = buildVariableMap(scopes);
  let result = text;
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const previous = result;
    result = result.replace(/\{\{(\s*[^{}]+?\s*)\}\}/g, (_match, varName: string) => {
      const trimmed = varName.trim();
      return varMap.has(trimmed) ? varMap.get(trimmed)! : `{{${trimmed}}}`;
    });
    // Stop if nothing changed — all resolved or no more matches
    if (result === previous) break;
  }

  return result;
}

/**
 * Resolve a URL that may contain :param path variables and append query params.
 *
 * Path variables: Replaces :paramName with the matching param value.
 * Query params: Appends enabled non-path params as query string.
 */
export function resolveUrlWithParams(
  url: string,
  params: KVPair[],
  varScopes?: VariableScopes
): string {
  if (!url) return url;

  // First resolve any {{variables}} in the URL itself
  let resolvedUrl = varScopes ? resolveVariables(url, varScopes) : url;

  // Separate path params (:paramName) from query params
  const pathParams: Array<{ name: string; value: string }> = [];
  const queryParams: Array<{ key: string; value: string }> = [];

  for (const param of params) {
    if (!param.enabled || !param.key.trim()) continue;

    const resolvedKey = varScopes ? resolveVariables(param.key, varScopes) : param.key;
    const resolvedValue = varScopes ? resolveVariables(param.value, varScopes) : param.value;

    if (resolvedKey.startsWith(':')) {
      // Path parameter
      pathParams.push({ name: resolvedKey.slice(1), value: resolvedValue });
    } else {
      // Query parameter
      queryParams.push({ key: resolvedKey, value: resolvedValue });
    }
  }

  // Replace :paramName in URL with values
  for (const { name, value } of pathParams) {
    // Match :paramName at word boundaries (not inside other words)
    const pattern = new RegExp(`:${escapeRegex(name)}\\b`, 'g');
    resolvedUrl = resolvedUrl.replace(pattern, encodeURIComponent(value));
  }

  // Append query params
  if (queryParams.length > 0) {
    const qs = new URLSearchParams(
      queryParams.map(p => [p.key, p.value])
    ).toString();
    if (qs) {
      resolvedUrl += resolvedUrl.includes('?') ? '&' : '?';
      resolvedUrl += qs;
    }
  }

  return resolvedUrl;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
