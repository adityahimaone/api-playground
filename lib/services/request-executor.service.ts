/**
 * Request Executor Service
 *
 * Sends resolved requests via the /api/proxy endpoint.
 * Returns a structured ApiResponse with status, headers, body, timing, and size.
 */

import { ResolvedRequest, ApiResponse } from '../entities/index';

/**
 * Execute a resolved HTTP request through the proxy endpoint.
 *
 * The proxy handles the actual fetch on the server side to avoid CORS issues.
 * Timing is measured client-side around the proxy call.
 */
export async function executeRequest(
  resolvedRequest: ResolvedRequest
): Promise<ApiResponse> {
  const { method, url, headers, body } = resolvedRequest;

  if (!url) {
    return {
      status: 0,
      statusText: 'No URL',
      headers: {},
      body: 'Error: No URL provided',
      time: 0,
      size: 0,
    };
  }

  const startTime = performance.now();

  try {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        url,
        headers,
        body,
      }),
    });

    const data = await response.json();
    const elapsed = Math.round(performance.now() - startTime);

    const responseBody = typeof data.body === 'string'
      ? data.body
      : JSON.stringify(data.body, null, 2);

    const result: ApiResponse = {
      status: data.status || 0,
      statusText: data.statusText || 'Unknown',
      headers: data.headers || {},
      body: responseBody,
      time: data.time || elapsed,
      size: new Blob([responseBody]).size,
    };

    return result;
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - startTime);

    return {
      status: 0,
      statusText: 'Network Error',
      headers: {},
      body: err.message || 'Failed to execute request',
      time: elapsed,
      size: 0,
    };
  }
}
