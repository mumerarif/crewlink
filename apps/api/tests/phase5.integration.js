const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, describe, test } = require('node:test');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../src/app');
const { IDS } = require('../prisma/seed-data');

const prisma = new PrismaClient();
const FIXTURES = {
  local28Announcement: '28500000-0000-4000-8000-000000000001',
  local27Unassigned: '27500000-0000-4000-8000-000000000001',
  local27Draft: '27500000-0000-4000-8000-000000000002',
  local27Disabled: '27500000-0000-4000-8000-000000000003',
  local27Approved: '27500000-0000-4000-8000-000000000004',
  local27Transition: '27500000-0000-4000-8000-000000000005',
};
let leader27Token;
let leader28Token;
let member27Token;
let member28Token;
let member27Id;
let member28Id;

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return response.body.data.token;
}

async function createRecipients(announcementId, localId, memberIds, states = []) {
  const recipients = memberIds.map((memberId, index) => ({
    id: randomUUID(),
    localId,
    announcementId,
    memberId,
    deliveryStatus: 'SENT',
    readAt: states[index]?.readAt || null,
    acknowledgedAt: states[index]?.acknowledgedAt || null,
    rsvpStatus: states[index]?.rsvpStatus || null,
    rsvpUpdatedAt: states[index]?.rsvpStatus ? new Date('2026-10-26T08:00:00.000Z') : null,
  }));
  await prisma.announcementRecipient.createMany({ data: recipients });
  await prisma.notificationOutbox.createMany({
    data: recipients.map((recipient) => ({
      id: randomUUID(), localId, recipientId: recipient.id,
      status: 'COMPLETED', attemptCount: 1,
    })),
  });
  await prisma.notificationDispatch.createMany({
    data: recipients.map((recipient) => ({
      localId, recipientId: recipient.id, dispatchedAt: new Date('2026-10-26T08:00:00.000Z'),
    })),
  });
  return recipients;
}

before(async () => {
  const [linked27, linked28, local27Others, local28Others] = await Promise.all([
    prisma.member.findFirst({ where: { localId: IDS.local27, userId: IDS.local27MemberUser } }),
    prisma.member.findFirst({ where: { localId: IDS.local28, userId: IDS.local28MemberUser } }),
    prisma.member.findMany({
      where: { localId: IDS.local27, userId: null }, orderBy: { id: 'asc' }, take: 2,
    }),
    prisma.member.findMany({
      where: { localId: IDS.local28, userId: null }, orderBy: { id: 'asc' }, take: 2,
    }),
  ]);
  member27Id = linked27.id;
  member28Id = linked28.id;

  await prisma.announcement.createMany({
    data: [
      {
        id: FIXTURES.local28Announcement, localId: IDS.local28,
        createdById: IDS.local28Leader, approvedById: IDS.local28Leader,
        title: 'Local 28 RSVP Meeting', body: 'Private Local 28 meeting details.',
        needsAck: true, rsvpEnabled: true, status: 'SENT',
        approvedAt: new Date('2026-10-26T07:00:00.000Z'),
        sentAt: new Date('2026-10-26T08:00:00.000Z'),
      },
      {
        id: FIXTURES.local27Unassigned, localId: IDS.local27,
        createdById: IDS.local27Leader, approvedById: IDS.local27Leader,
        title: 'Unassigned Local 27 Notice', body: 'Not addressed to the login member.',
        needsAck: true, rsvpEnabled: true, status: 'SENT',
        approvedAt: new Date(), sentAt: new Date(),
      },
      {
        id: FIXTURES.local27Draft, localId: IDS.local27,
        createdById: IDS.local27Leader,
        title: 'Hidden Draft', body: 'Must not be member-visible.',
        needsAck: true, rsvpEnabled: true, status: 'DRAFT',
      },
      {
        id: FIXTURES.local27Disabled, localId: IDS.local27,
        createdById: IDS.local27Leader, approvedById: IDS.local27Leader,
        title: 'Ordinary Notice', body: 'RSVP and acknowledgment are disabled.',
        needsAck: false, rsvpEnabled: false, status: 'SENT',
        approvedAt: new Date(), sentAt: new Date(),
      },
      {
        id: FIXTURES.local27Approved, localId: IDS.local27,
        createdById: IDS.local27Leader, approvedById: IDS.local27Leader,
        title: 'Approved RSVP Configuration', body: 'Immutable after approval.',
        needsAck: true, rsvpEnabled: true, status: 'APPROVED', approvedAt: new Date(),
      },
      {
        id: FIXTURES.local27Transition, localId: IDS.local27,
        createdById: IDS.local27Leader, approvedById: IDS.local27Leader,
        title: 'Transitioning Announcement', body: 'Not interactive until fully sent.',
        needsAck: true, rsvpEnabled: true, status: 'SENDING', approvedAt: new Date(),
      },
    ],
  });
  await createRecipients(
    FIXTURES.local28Announcement,
    IDS.local28,
    [member28Id, ...local28Others.map((member) => member.id)],
    [
      {},
      { readAt: new Date('2026-10-26T09:00:00.000Z'), acknowledgedAt: new Date('2026-10-26T09:01:00.000Z'), rsvpStatus: 'NO' },
      { readAt: new Date('2026-10-26T09:02:00.000Z'), rsvpStatus: 'MAYBE' },
    ],
  );
  await createRecipients(FIXTURES.local27Unassigned, IDS.local27, [local27Others[0].id]);
  await createRecipients(FIXTURES.local27Draft, IDS.local27, [member27Id]);
  await createRecipients(FIXTURES.local27Disabled, IDS.local27, [member27Id]);
  await createRecipients(FIXTURES.local27Transition, IDS.local27, [member27Id]);

  [leader27Token, leader28Token, member27Token, member28Token] = await Promise.all([
    login('leader27@example.test', 'CrewLink27Leader!'),
    login('leader28@example.test', 'CrewLink28Leader!'),
    login('member27@example.test', 'CrewLink27Member!'),
    login('member28@example.test', 'CrewLink28Member!'),
  ]);
});

after(async () => prisma.$disconnect());

describe('member inbox and ownership', () => {
  test('inbox contains only addressed, sent, same-local announcements', async () => {
    const local27 = await request(app).get('/api/member/announcements?limit=100')
      .set(bearer(member27Token));
    assert.equal(local27.status, 200);
    const ids = local27.body.data.items.map((item) => item.id);
    assert.ok(ids.includes(IDS.sentAnnouncement));
    assert.ok(ids.includes(FIXTURES.local27Disabled));
    assert.equal(ids.includes(FIXTURES.local27Unassigned), false);
    assert.equal(ids.includes(FIXTURES.local27Draft), false);
    assert.equal(ids.includes(FIXTURES.local28Announcement), false);
  });

  test('cursor pagination is bounded and deterministic', async () => {
    const first = await request(app).get('/api/member/announcements?limit=1')
      .set(bearer(member27Token));
    assert.equal(first.status, 200);
    assert.equal(first.body.data.items.length, 1);
    assert.equal(first.body.data.pagination.hasMore, true);
    const second = await request(app)
      .get(`/api/member/announcements?limit=1&cursor=${encodeURIComponent(first.body.data.pagination.nextCursor)}`)
      .set(bearer(member27Token));
    assert.equal(second.status, 200);
    assert.notEqual(second.body.data.items[0].id, first.body.data.items[0].id);
    assert.equal((await request(app).get('/api/member/announcements?limit=101').set(bearer(member27Token))).status, 400);
  });

  test('detail rejects unassigned, cross-local, and draft announcements', async () => {
    for (const id of [FIXTURES.local27Unassigned, FIXTURES.local28Announcement, FIXTURES.local27Draft]) {
      assert.equal((await request(app).get(`/api/member/announcements/${id}`).set(bearer(member27Token))).status, 404);
    }
  });

  test('leader identities cannot act as members and unauthenticated inbox is private', async () => {
    assert.equal((await request(app).get('/api/member/announcements')).status, 401);
    assert.equal((await request(app).post(`/api/member/announcements/${IDS.sentAnnouncement}/acknowledge`)
      .set(bearer(leader27Token))).status, 403);
    assert.equal((await request(app).put(`/api/member/announcements/${IDS.sentAnnouncement}/rsvp`)
      .set(bearer(leader27Token)).send({ response: 'YES' })).status, 403);
  });
});

describe('read and acknowledgment', () => {
  test('concurrent reads preserve one first-read timestamp without acknowledging', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(app)
      .post(`/api/member/announcements/${IDS.sentAnnouncement}/read`)
      .set(bearer(member27Token))
      .send({ memberId: member28Id, localId: IDS.local28 })));
    assert.ok(responses.every((response) => response.status === 200));
    const timestamps = new Set(responses.map((response) => response.body.data.readAt));
    assert.equal(timestamps.size, 1);
    assert.equal(responses[0].body.data.acknowledgedAt, null);
    const unread = await request(app).get('/api/member/announcements?read=unread&limit=100')
      .set(bearer(member27Token));
    assert.equal(unread.body.data.items.some((item) => item.id === IDS.sentAnnouncement), false);
    const read = await request(app).get('/api/member/announcements?read=read&limit=100')
      .set(bearer(member27Token));
    assert.equal(read.body.data.items.some((item) => item.id === IDS.sentAnnouncement), true);
  });

  test('concurrent acknowledgments preserve the first timestamp and dispatch count', async () => {
    const beforeRecipient = await prisma.announcementRecipient.findFirst({
      where: { announcementId: IDS.sentAnnouncement, memberId: member27Id },
    });
    const beforeDispatches = await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: IDS.sentAnnouncement, memberId: member27Id } },
    });
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(app)
      .post(`/api/member/announcements/${IDS.sentAnnouncement}/acknowledge`)
      .set(bearer(member27Token))));
    assert.ok(responses.every((response) => response.status === 200));
    assert.equal(new Set(responses.map((response) => response.body.data.acknowledgedAt)).size, 1);
    assert.equal(responses[0].body.data.readAt, beforeRecipient.readAt.toISOString());
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: IDS.sentAnnouncement, memberId: member27Id } },
    }), beforeDispatches);
    const acknowledged = await request(app)
      .get('/api/member/announcements?acknowledgment=acknowledged&limit=100')
      .set(bearer(member27Token));
    assert.equal(acknowledged.body.data.items.some((item) => item.id === IDS.sentAnnouncement), true);
  });

  test('acknowledgment marks an unread announcement as read', async () => {
    const response = await request(app)
      .post(`/api/member/announcements/${FIXTURES.local28Announcement}/acknowledge`)
      .set(bearer(member28Token));
    assert.equal(response.status, 200);
    assert.ok(response.body.data.acknowledgedAt);
    assert.ok(response.body.data.readAt);
    const stored = await prisma.announcementRecipient.findFirst({
      where: { announcementId: FIXTURES.local28Announcement, memberId: member28Id },
    });
    assert.ok(stored.readAt);
    assert.ok(stored.acknowledgedAt);
  });

  test('acknowledgment rejects disabled, unassigned, cross-local, and unsent announcements', async () => {
    assert.equal((await request(app).post(`/api/member/announcements/${FIXTURES.local27Disabled}/acknowledge`).set(bearer(member27Token))).status, 409);
    for (const id of [FIXTURES.local27Unassigned, FIXTURES.local28Announcement, FIXTURES.local27Draft]) {
      assert.equal((await request(app).post(`/api/member/announcements/${id}/acknowledge`).set(bearer(member27Token))).status, 404);
    }
  });

  test('interactions are rejected during SENDING and allowed after persisted SENT', async () => {
    assert.equal((await request(app).post(`/api/member/announcements/${FIXTURES.local27Transition}/acknowledge`)
      .set(bearer(member27Token))).status, 404);
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local27Transition}/rsvp`)
      .set(bearer(member27Token)).send({ response: 'YES' })).status, 404);
    await prisma.announcement.update({
      where: { id: FIXTURES.local27Transition },
      data: { status: 'SENT', sentAt: new Date() },
    });
    assert.equal((await request(app).post(`/api/member/announcements/${FIXTURES.local27Transition}/acknowledge`)
      .set(bearer(member27Token))).status, 200);
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local27Transition}/rsvp`)
      .set(bearer(member27Token)).send({ response: 'YES' })).status, 200);
  });
});

describe('RSVP state', () => {
  test('member can RSVP and identical retries preserve the timestamp', async () => {
    const first = await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'YES', memberId: member27Id });
    const repeated = await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'YES' });
    assert.equal(first.status, 200);
    assert.equal(repeated.status, 200);
    assert.equal(first.body.data.rsvpResponse, 'YES');
    assert.equal(repeated.body.data.rsvpUpdatedAt, first.body.data.rsvpUpdatedAt);
  });

  test('responses may change and concurrent different values leave one authoritative value', async () => {
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'NO' })).body.data.rsvpResponse, 'NO');
    const concurrent = await Promise.all(['YES', 'MAYBE'].map((response) => request(app)
      .put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response })));
    assert.ok(concurrent.every((response) => response.status === 200));
    const stored = await prisma.announcementRecipient.findFirst({
      where: { announcementId: FIXTURES.local28Announcement, memberId: member28Id },
    });
    assert.ok(['YES', 'MAYBE'].includes(stored.rsvpStatus));
    assert.ok(stored.rsvpUpdatedAt);
    await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'YES' });
  });

  test('RSVP rejects invalid, disabled, unassigned, and cross-local requests', async () => {
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'LATER' })).status, 400);
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local27Disabled}/rsvp`)
      .set(bearer(member27Token)).send({ response: 'YES' })).status, 409);
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local27Unassigned}/rsvp`)
      .set(bearer(member27Token)).send({ response: 'YES' })).status, 404);
    assert.equal((await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member27Token)).send({ response: 'YES' })).status, 404);
  });

  test('RSVP does not alter read, acknowledgment, delivery, or dispatch state', async () => {
    const before = await prisma.announcementRecipient.findFirst({
      where: { announcementId: FIXTURES.local28Announcement, memberId: member28Id },
    });
    const dispatches = await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: FIXTURES.local28Announcement, memberId: member28Id } },
    });
    await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'YES' });
    const afterState = await prisma.announcementRecipient.findFirst({
      where: { announcementId: FIXTURES.local28Announcement, memberId: member28Id },
    });
    assert.equal(afterState.readAt?.toISOString(), before.readAt?.toISOString());
    assert.equal(afterState.acknowledgedAt?.toISOString(), before.acknowledgedAt?.toISOString());
    assert.equal(afterState.deliveryStatus, before.deliveryStatus);
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: FIXTURES.local28Announcement, memberId: member28Id } },
    }), dispatches);
  });

  test('RSVP configuration is immutable after approval and members cannot edit it', async () => {
    assert.equal((await request(app).patch(`/api/announcements/${FIXTURES.local27Approved}`)
      .set(bearer(leader27Token)).send({ rsvpEnabled: false })).status, 409);
    assert.equal((await request(app).patch(`/api/announcements/${FIXTURES.local27Approved}`)
      .set(bearer(member27Token)).send({ rsvpEnabled: false })).status, 403);
  });
});

describe('leader engagement reporting', () => {
  test('member interactions produce accurate PostgreSQL engagement totals', async () => {
    await request(app).post(`/api/member/announcements/${FIXTURES.local28Announcement}/read`)
      .set(bearer(member28Token));
    await request(app).post(`/api/member/announcements/${FIXTURES.local28Announcement}/acknowledge`)
      .set(bearer(member28Token));
    await request(app).put(`/api/member/announcements/${FIXTURES.local28Announcement}/rsvp`)
      .set(bearer(member28Token)).send({ response: 'YES' });
    const response = await request(app)
      .get(`/api/announcements/${FIXTURES.local28Announcement}/engagement`)
      .set(bearer(leader28Token));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      announcementId: FIXTURES.local28Announcement,
      totalRecipients: 3,
      delivery: { completed: 3, pending: 0, failed: 0 },
      reads: { read: 3, unread: 0 },
      acknowledgments: { required: true, acknowledged: 2, outstanding: 1 },
      rsvp: { enabled: true, yes: 1, no: 1, maybe: 1, noResponse: 0 },
    });
  });

  test('cross-local leaders and members cannot access engagement reports', async () => {
    assert.equal((await request(app).get(`/api/announcements/${FIXTURES.local28Announcement}/engagement`)
      .set(bearer(leader27Token))).status, 404);
    assert.equal((await request(app).get(`/api/announcements/${FIXTURES.local28Announcement}/engagement`)
      .set(bearer(member28Token))).status, 403);
  });
});
