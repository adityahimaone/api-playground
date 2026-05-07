import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { method, url, headers, body } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required', status: 0 }, { status: 400 });
    }

    const fetchHeaders: Record<string, string> = {};
    if (headers) {
      Object.entries(headers).forEach(([k, v]) => {
        if (k && v) fetchHeaders[k] = v as string;
      });
    }

    // Remove host header to avoid conflicts
    delete fetchHeaders['host'];
    delete fetchHeaders['Host'];

    // Auto-detect JSON body and set Content-Type if not already provided
    const hasContentType = Object.keys(fetchHeaders).some(
      (k) => k.toLowerCase() === 'content-type'
    );
    if (!hasContentType && body && method !== 'GET' && method !== 'HEAD') {
      try {
        JSON.parse(body);
        fetchHeaders['Content-Type'] = 'application/json';
      } catch {
        // Not JSON, don't set Content-Type
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: fetchHeaders,
      redirect: 'follow',
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }

    const start = performance.now();
    const res = await fetch(url, fetchOptions);
    const elapsed = Math.round(performance.now() - start);

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    const responseBody = await res.text();

    return NextResponse.json({
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body: responseBody,
      time: elapsed,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 0,
      statusText: 'Proxy Error',
      headers: {},
      body: err.message || 'Unknown error',
      time: 0,
    });
  }
}
