import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnnouncementPayload, destinationForRole, shouldPollStatus } from '../lib/api.js';
import { isSameOriginMutation, sessionCookieOptions } from '../lib/auth-config.js';
import { isAllowedBackendRequest, normalizeBackendPath } from '../lib/proxy-rules.js';
import { buildInboxPath, engagementViewState, leaderActionsForStatus, rsvpPayload, shouldRecordRead } from '../lib/ui-policy.js';

const id = '29865435-8175-462f-aa3a-2a73d693b464';

test('leader and member roles route to their authorized dashboards', () => {
  assert.equal(destinationForRole('LEADER'), '/leader');
  assert.equal(destinationForRole('MEMBER'), '/member');
  assert.equal(destinationForRole('UNKNOWN'), '/login');
});

test('announcement payload includes only editable backend fields', () => {
  assert.deepEqual(buildAnnouncementPayload({ title: '  Update ', body: ' Body ', pushPreview: ' ', needsAck: 1, rsvpEnabled: 0, classificationFilter: ' Welder ' }), { title: 'Update', body: 'Body', pushPreview: null, needsAck: true, rsvpEnabled: false, classificationFilter: 'Welder' });
});

test('polling continues only for authoritative SENDING state', () => {
  assert.equal(shouldPollStatus('SENDING'), true);
  for (const status of ['DRAFT', 'APPROVED', 'SENT', 'FAILED']) assert.equal(shouldPollStatus(status), false);
});

test('proxy permits the supported leader announcement contract', () => {
  assert.equal(isAllowedBackendRequest('GET', '/api/announcements?page=2&limit=20'), true);
  assert.equal(isAllowedBackendRequest('POST', '/api/announcements'), true);
  assert.equal(isAllowedBackendRequest('PATCH', `/api/announcements/${id}`), true);
  assert.equal(isAllowedBackendRequest('POST', `/api/announcements/${id}/approve`), true);
  assert.equal(isAllowedBackendRequest('GET', `/api/announcements/${id}/engagement`), true);
});

test('BFF catch-all does not duplicate the API prefix', () => {
  assert.equal(normalizeBackendPath(['api', 'members']), '/api/members');
  assert.equal(normalizeBackendPath(['members']), '/api/members');
  assert.equal(normalizeBackendPath(['api', 'announcements', id]), `/api/announcements/${id}`);
});

test('proxy permits member inbox interactions', () => {
  assert.equal(isAllowedBackendRequest('GET', '/api/member/announcements?read=unread'), true);
  assert.equal(isAllowedBackendRequest('POST', `/api/member/announcements/${id}/read`), true);
  assert.equal(isAllowedBackendRequest('POST', `/api/member/announcements/${id}/acknowledge`), true);
  assert.equal(isAllowedBackendRequest('PUT', `/api/member/announcements/${id}/rsvp`), true);
});

test('proxy rejects unsupported methods, malformed identifiers, auth, and arbitrary URLs', () => {
  assert.equal(isAllowedBackendRequest('DELETE', `/api/announcements/${id}`), false);
  assert.equal(isAllowedBackendRequest('GET', '/api/auth/me'), false);
  assert.equal(isAllowedBackendRequest('GET', '/api/announcements/not-a-uuid'), false);
  assert.equal(isAllowedBackendRequest('GET', 'https://example.com/api/members'), false);
});

test('same-origin mutation rejects explicit cross-site browser requests', () => {
  const crossSite = new Request('http://localhost:3000/api/session/logout', { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(isSameOriginMutation(crossSite), false);
});

test('same-origin mutation accepts matching Origin and rejects mismatches', () => {
  assert.equal(isSameOriginMutation(new Request('http://localhost:3000/api/session/logout', { headers: { origin: 'http://localhost:3000' } })), true);
  assert.equal(isSameOriginMutation(new Request('http://localhost:3000/api/session/logout', { headers: { origin: 'http://evil.test' } })), false);
});

test('same-origin mutation honors the public Host behind Docker port mapping', () => {
  const request = new Request('http://0.0.0.0:3000/api/session/login', { headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } });
  assert.equal(isSameOriginMutation(request), true);
});

test('session cookie is HttpOnly, SameSite, scoped, and one hour', () => {
  const cookie = sessionCookieOptions();
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'lax'); assert.equal(cookie.path, '/'); assert.equal(cookie.maxAge, 3600);
});

test('leader actions enforce the announcement lifecycle', () => {
  assert.deepEqual(leaderActionsForStatus('DRAFT'), ['edit', 'submit']);
  assert.deepEqual(leaderActionsForStatus('PENDING_APPROVAL'), ['approve']);
  assert.deepEqual(leaderActionsForStatus('APPROVED'), ['send']);
  assert.deepEqual(leaderActionsForStatus('SENDING'), []);
  assert.deepEqual(leaderActionsForStatus('SENT'), []);
});

test('member detail requests read at most once per visit', () => {
  const unread = { recipient: { readAt: null } };
  assert.equal(shouldRecordRead(unread, false), true);
  assert.equal(shouldRecordRead(unread, true), false);
  assert.equal(shouldRecordRead({ recipient: { readAt: '2026-01-01' } }, false), false);
});

test('RSVP controls construct only supported backend payloads', () => {
  for (const response of ['YES', 'NO', 'MAYBE']) assert.deepEqual(rsvpPayload(response), { response });
  assert.throws(() => rsvpPayload('LATER'), /Invalid RSVP/);
});

test('member pagination uses cursor and backend-supported filters', () => {
  assert.equal(buildInboxPath({ limit: 12, cursor: 'opaque', read: 'unread', acknowledgment: 'unacknowledged' }), '/api/member/announcements?limit=12&cursor=opaque&read=unread&acknowledgment=unacknowledged');
});

test('engagement waits for data when send enables the panel', () => {
  assert.equal(engagementViewState(false, { loading: false }), 'disabled');
  assert.equal(engagementViewState(true, { loading: false }), 'loading');
  assert.equal(engagementViewState(true, { loading: true }), 'loading');
  assert.equal(engagementViewState(true, { loading: false, data: { totalRecipients: 180 } }), 'ready');
});

test('API client preserves backend conflict and validation details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Current state is invalid', errors: [{ msg: 'Only drafts can be edited' }] }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  try {
    await assert.rejects(() => import('../lib/api.js').then(({ apiRequest }) => apiRequest('/api/announcements')), (error) => error.status === 409 && error.errors[0].msg === 'Only drafts can be edited');
  } finally { globalThis.fetch = originalFetch; }
});

test('API client reports an unreadable upstream response safely', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
  try {
    await assert.rejects(() => import('../lib/api.js').then(({ apiRequest }) => apiRequest('/api/members')), /unreadable response/);
  } finally { globalThis.fetch = originalFetch; }
});

test('invalid client paths cannot bypass the relative API boundary', async () => {
  const { apiRequest } = await import('../lib/api.js');
  await assert.rejects(() => apiRequest('https://evil.test/api/members'), /must start with/);
});
