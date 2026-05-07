/**
 * Variable Resolution Service — Full Postman-like scope system
 *
 * Resolution order (last wins): local → environment → collection → global → dynamic
 * Supports {{variable_name}} syntax with recursive resolution.
 * Handles :param path variables AND query params.
 * Dynamic variables: $timestamp, $guid, $randomInt, $isoTimestamp
 */

import {
  VariableEntity,
  KVPair,
  createKVPair,
} from '../entities/index';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ResolveContext {
  localVariables?: VariableEntity[];
  environmentVariables?: VariableEntity[];
  collectionVariables?: VariableEntity[];
  globalVariables?: VariableEntity[];
}

export interface PreviewResult {
  resolved: string;
  missing: string[];
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC VARIABLES
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a Postman-style dynamic variable by name.
 * Supports:
 *   $timestamp   — Unix epoch seconds
 *   $guid        — Random UUID v4
 *   $randomInt   — Random integer 0–1000
 *   $isoTimestamp — ISO 8601 string
 *
 * Returns undefined if the name is not a known dynamic variable.
 */
export function resolveDynamicVariable(name: string): string | undefined {
  switch (name) {
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$guid':
      return generateGuid();
    case '$randomInt':
      return String(Math.floor(Math.random() * 1001));
    case '$isoTimestamp':
      return new Date().toISOString();
    default:
      return undefined;
  }
}

function generateGuid(): string {
  // RFC 4122 v4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Build merged variable map from all scopes
// ═══════════════════════════════════════════════════════════════

/**
 * Build a merged map from all scopes.
 * Resolution order (last wins): local < environment < collection < global
 * Each scope only includes enabled variables.
 */
function buildVariableMap(context: ResolveContext): Map<string, string> {
  const map = new Map<string, string>();

  // Process scopes in priority order — each layer overwrites the previous
  const layers: VariableEntity[][] = [
    context.localVariables ?? [],
    context.environmentVariables ?? [],
    context.collectionVariables ?? [],
    context.globalVariables ?? [],
  ];

  for (const layer of layers) {
    for (const variable of layer) {
      if (variable.enabled && variable.key.trim()) {
        map.set(variable.key.trim(), variable.currentValue);
      }
    }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════
// CORE RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve all {{variable_name}} occurrences in text.
 * Resolution order: local → environment → collection → global → dynamic.
 * Recursively resolves until no more placeholders remain (max 10 passes).
 * Unresolved placeholders are left as-is ({{name}}).
 */
export function resolveVariables(
  text: string,
  context: ResolveContext
): string {
  if (!text) return text;

  const varMap = buildVariableMap(context);
  let result = text;
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const previous = result;
    result = result.replace(
      /\{\{(\s*[^{}]+?\s*)\}\}/g,
      (_match, varName: string) => {
        const trimmed = varName.trim();

        // 1. Check named scopes
        if (varMap.has(trimmed)) {
          return varMap.get(trimmed)!;
        }

        // 2. Check dynamic variables ($ prefixed)
        if (trimmed.startsWith('$')) {
          const dynamicValue = resolveDynamicVariable(trimmed);
          if (dynamicValue !== undefined) {
            return dynamicValue;
          }
        }

        // Unresolved — leave as-is
        return `{{${trimmed}}}`;
      }
    );
    // Stop if nothing changed — all resolved or no more matches
    if (result === previous) break;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// URL + PATH PARAM RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a URL that may contain :param path variables and {{variable}} placeholders.
 *
 * 1. Replace :param path variables from the params KVPair list
 * 2. Resolve all {{variables}} in the result
 */
export function resolveUrlWithParams(
  url: string,
  params: KVPair[],
  context?: ResolveContext
): string {
  if (!url) return url;

  let resolvedUrl = url;

  // Separate path params (:paramName) from query params
  const pathParams: Array<{ name: string; value: string }> = [];
  const queryParams: Array<{ key: string; value: string }> = [];

  for (const param of params) {
    if (!param.enabled || !param.key.trim()) continue;

    const resolvedKey = context
      ? resolveVariables(param.key, context)
      : param.key;
    const resolvedValue = context
      ? resolveVariables(param.value, context)
      : param.value;

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
    const pattern = new RegExp(`:${escapeRegex(name)}\\b`, 'g');
    resolvedUrl = resolvedUrl.replace(pattern, encodeURIComponent(value));
  }

  // Resolve all {{variables}} in the URL
  if (context) {
    resolvedUrl = resolveVariables(resolvedUrl, context);
  }

  // Append query params
  if (queryParams.length > 0) {
    const qs = new URLSearchParams(
      queryParams.map((p) => [p.key, p.value])
    ).toString();
    if (qs) {
      resolvedUrl += resolvedUrl.includes('?') ? '&' : '?';
      resolvedUrl += qs;
    }
  }

  return resolvedUrl;
}

// ═══════════════════════════════════════════════════════════════
// VARIABLE EXTRACTION & ANALYSIS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract all {{variable}} names from text.
 * Returns a unique list of variable names (without braces).
 */
export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\s*[\w.$-]+\s*)\}\}/g);
  if (!matches) return [];
  return Array.from(
    new Set(
      matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim())
    )
  );
}

/**
 * Get all {{variables}} from text that are NOT found in any scope.
 * Checks all four named scopes + dynamic variables.
 * Returns variable names that are missing / undefined.
 */
export function getMissingVariables(
  text: string,
  allVariables: VariableEntity[]
): string[] {
  const referenced = extractVariables(text);
  if (referenced.length === 0) return [];

  // Build a set of all known variable keys (enabled only)
  const knownKeys = new Set<string>();
  for (const v of allVariables) {
    if (v.enabled) {
      knownKeys.add(v.key.trim());
    }
  }

  return referenced.filter((name) => {
    // Dynamic variables ($ prefixed) are always available
    if (name.startsWith('$')) {
      return resolveDynamicVariable(name) === undefined;
    }
    // Missing if not in any scope
    return !knownKeys.has(name);
  });
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Preview the resolved text and list any missing variables.
 * Returns both the resolved string and the list of unresolved variable names.
 */
export function previewResolved(
  text: string,
  context: ResolveContext
): PreviewResult {
  const resolved = resolveVariables(text, context);

  // Collect all variables from all scopes
  const allVariables: VariableEntity[] = [
    ...(context.localVariables ?? []),
    ...(context.environmentVariables ?? []),
    ...(context.collectionVariables ?? []),
    ...(context.globalVariables ?? []),
  ];

  const missing = getMissingVariables(text, allVariables);

  return { resolved, missing };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Utility: Convert a flat list of VariableEntity[] into KVPair[].
 * Useful for bridging the entity system with the old KVPair-based API.
 */
export function variablesToKVPairs(variables: VariableEntity[]): KVPair[] {
  return variables
    .filter((v) => v.enabled)
    .map((v) => createKVPair(v.key, v.currentValue, true));
}

/**
 * Utility: Resolve a single variable by key from a set of scopes.
 * Returns undefined if not found.
 */
export function lookupVariable(
  key: string,
  context: ResolveContext
): string | undefined {
  const varMap = buildVariableMap(context);
  if (varMap.has(key)) {
    return varMap.get(key);
  }
  if (key.startsWith('$')) {
    return resolveDynamicVariable(key);
  }
  return undefined;
}
