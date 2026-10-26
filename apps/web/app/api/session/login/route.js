import { NextResponse } from 'next/server.js';
import {
  internalApiUrl,
  isSameOriginMutation,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../../../lib/auth-config.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ success: false, message: 'Request origin is not allowed' }, { status: 403 });
  }
  let credentials;
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${internalApiUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
      cache: 'no-store',
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload?.success || !payload.data?.token) {
      const status = upstream.status === 401 ? 401 : upstream.status;
      const message = upstream.status === 401 ? 'Invalid email or password' : (payload?.message || 'Unable to sign in');
      return NextResponse.json({ success: false, message, errors: payload?.errors || [] }, { status });
    }
    const response = NextResponse.json({ success: true, data: { user: payload.data.user } });
    response.cookies.set(SESSION_COOKIE, payload.data.token, sessionCookieOptions());
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch {
    return NextResponse.json({ success: false, message: 'Authentication service is unavailable' }, { status: 503 });
  }
}
