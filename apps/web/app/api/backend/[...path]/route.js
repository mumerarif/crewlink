import { cookies } from 'next/headers';
import { NextResponse } from 'next/server.js';
import {
  internalApiUrl,
  isSameOriginMutation,
  SESSION_COOKIE,
} from '../../../../lib/auth-config.js';
import { isAllowedBackendRequest, normalizeBackendPath } from '../../../../lib/proxy-rules.js';

export const dynamic = 'force-dynamic';
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function proxy(request, context) {
  const { path } = await context.params;
  const apiPath = normalizeBackendPath(path);
  const pathWithQuery = `${apiPath}${new URL(request.url).search}`;
  if (!isAllowedBackendRequest(request.method, pathWithQuery)) {
    return NextResponse.json({ success: false, message: 'API route is not available' }, { status: 404 });
  }
  if (MUTATIONS.has(request.method) && !isSameOriginMutation(request)) {
    return NextResponse.json({ success: false, message: 'Request origin is not allowed' }, { status: 403 });
  }
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
  try {
    const body = request.method === 'GET' ? undefined : await request.text();
    const upstream = await fetch(`${internalApiUrl()}${pathWithQuery}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
    });
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const response = new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store, private' },
    });
    return response;
  } catch {
    return NextResponse.json({ success: false, message: 'API service is unavailable' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
