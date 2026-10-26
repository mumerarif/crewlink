export const SESSION_COOKIE = 'crewlink_session';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 60 * 60,
  };
}

export function internalApiUrl() {
  return (process.env.INTERNAL_API_URL || 'http://localhost:8080').replace(/\/$/, '');
}

export function isSameOriginMutation(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '');
    const publicOrigin = host ? `${protocol}://${host}` : requestUrl.origin;
    return new URL(origin).origin === publicOrigin || new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}
