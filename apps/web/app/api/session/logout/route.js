import { NextResponse } from 'next/server.js';
import { isSameOriginMutation, SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/auth-config.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ success: false, message: 'Request origin is not allowed' }, { status: 403 });
  }
  const response = NextResponse.json({ success: true, data: null });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
}
