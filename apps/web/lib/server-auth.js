import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { internalApiUrl, SESSION_COOKIE } from './auth-config';

export async function getServerUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${internalApiUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()).data;
  } catch {
    return null;
  }
}

export async function requireRole(role) {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== role) redirect(user.role === 'LEADER' ? '/leader' : '/member');
  return user;
}
