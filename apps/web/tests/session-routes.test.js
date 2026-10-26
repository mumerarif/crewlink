import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as login } from '../app/api/session/login/route.js';
import { POST as logout } from '../app/api/session/logout/route.js';

function request(path, body) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('valid login returns the user without exposing the JWT and sets HttpOnly cookie', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { token: 'secret.jwt.value', user: { id: 'u1', role: 'LEADER', email: 'leader@example.test' } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const response = await login(request('/api/session/login', { email: 'leader@example.test', password: 'password' }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.user.role, 'LEADER');
    assert.equal(JSON.stringify(payload).includes('secret.jwt.value'), false);
    assert.match(response.headers.get('set-cookie'), /crewlink_session=secret\.jwt\.value/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=lax/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('invalid credentials remain generic and never set a session', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Invalid email or password' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  try {
    const response = await login(request('/api/session/login', { email: 'unknown@example.test', password: 'wrong' }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, 'Invalid email or password');
    assert.equal(response.headers.has('set-cookie'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('login rejects a cross-site request before contacting the API', { concurrency: false }, async () => {
  let called = false; const originalFetch = globalThis.fetch; globalThis.fetch = async () => { called = true; throw new Error('must not run'); };
  try {
    const response = await login(new Request('http://localhost:3000/api/session/login', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(response.status, 403); assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('logout expires the HttpOnly session cookie', async () => {
  const response = await logout(request('/api/session/logout'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /crewlink_session=/);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});
