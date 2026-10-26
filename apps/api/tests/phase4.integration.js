const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, describe, test } = require('node:test');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../src/app');
const { IDS } = require('../prisma/seed-data');
const {
  deliverOutbox,
  finalizeAnnouncement,
  reconcileSendingAnnouncements,
} = require('../src/modules/announcements/notification.service');
const { publishPendingOutbox } = require('../src/queues/outbox.publisher');
const env = require('../src/config/env');

const prisma = new PrismaClient();
let leader27Token;
let leader28Token;
let member27Token;

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

async function createDraft(overrides = {}) {
  return request(app)
    .post('/api/announcements')
    .set(bearer(leader27Token))
    .send({
      title: 'Phase 4 integration announcement',
      body: 'Human-reviewed integration content.',
      pushPreview: 'Phase 4 update',
      classificationFilter: 'Phase4 Tiny Audience',
      ...overrides,
    });
}

async function approve(id) {
  await request(app).post(`/api/announcements/${id}/submit`).set(bearer(leader27Token));
  return request(app).post(`/api/announcements/${id}/approve`).set(bearer(leader27Token));
}

async function createApprovedSend(classificationFilter) {
  const draft = await createDraft({ classificationFilter });
  await approve(draft.body.data.id);
  await request(app)
    .post(`/api/announcements/${draft.body.data.id}/send`)
    .set(bearer(leader27Token));
  return draft.body.data.id;
}

async function createFinalizationFixture({
  localId = IDS.local27,
  createdById = IDS.local27Leader,
  statuses,
}) {
  const members = await prisma.member.findMany({
    where: { localId },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: statuses.length,
  });
  assert.equal(members.length, statuses.length);
  const announcement = await prisma.announcement.create({
    data: {
      localId,
      createdById,
      approvedById: createdById,
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
      title: 'Finalization race fixture',
      body: 'Persisted test content.',
      status: 'SENDING',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  const recipients = members.map((member, index) => ({
    id: randomUUID(),
    localId,
    announcementId: announcement.id,
    memberId: member.id,
    deliveryStatus: statuses[index] === 'COMPLETED'
      ? 'SENT'
      : statuses[index] === 'FAILED' ? 'FAILED' : 'PENDING',
  }));
  await prisma.announcementRecipient.createMany({ data: recipients });
  const outboxes = recipients.map((recipient, index) => ({
    id: randomUUID(),
    localId,
    recipientId: recipient.id,
    status: statuses[index],
    attemptCount: statuses[index] === 'FAILED' ? 5 : statuses[index] === 'COMPLETED' ? 1 : 0,
  }));
  await prisma.notificationOutbox.createMany({ data: outboxes });
  const dispatches = recipients
    .filter((_recipient, index) => statuses[index] === 'COMPLETED')
    .map((recipient) => ({
      localId,
      recipientId: recipient.id,
      dispatchedAt: new Date(),
    }));
  if (dispatches.length > 0) {
    await prisma.notificationDispatch.createMany({ data: dispatches });
  }
  return { announcement, recipients, outboxes };
}

before(async () => {
  await prisma.member.createMany({
    data: [
      {
        id: '27000000-f400-4000-8000-000000000001', localId: IDS.local27,
        fullName: 'Phase Four Member One', email: 'phase4-one@example.test',
        classification: 'Phase4 Tiny Audience', status: 'ACTIVE',
      },
      {
        id: '27000000-f400-4000-8000-000000000002', localId: IDS.local27,
        fullName: 'Phase Four Member Two', email: 'phase4-two@example.test',
        classification: 'Phase4 Tiny Audience', status: 'ACTIVE',
      },
      {
        id: '28000000-f400-4000-8000-000000000001', localId: IDS.local28,
        fullName: 'Other Local Phase Four Member', email: 'phase4-other@example.test',
        classification: 'Phase4 Tiny Audience', status: 'ACTIVE',
      },
    ],
  });
  [leader27Token, leader28Token, member27Token] = await Promise.all([
    login('leader27@example.test', 'CrewLink27Leader!'),
    login('leader28@example.test', 'CrewLink28Leader!'),
    login('member27@example.test', 'CrewLink27Member!'),
  ]);
});

after(async () => prisma.$disconnect());

describe('AI drafting boundary', () => {
  test('leader receives an offline draft without creating or advancing an announcement', async () => {
    const beforeCount = await prisma.announcement.count();
    const response = await request(app).post('/api/ai/draft').set(bearer(leader27Token)).send({
      topic: 'Upcoming Membership Meeting',
      keyPoints: ['Review the agenda', 'Submit questions in advance'],
      tone: 'professional',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.provider, 'mock');
    assert.equal(response.body.data.requiresHumanApproval, true);
    assert.equal(await prisma.announcement.count(), beforeCount);
  });

  test('members cannot generate leadership drafts', async () => {
    const response = await request(app).post('/api/ai/draft').set(bearer(member27Token)).send({
      topic: 'Forbidden topic', keyPoints: ['No access'],
    });
    assert.equal(response.status, 403);
  });
});

describe('announcement lifecycle and tenant isolation', () => {
  test('trusted identity overrides client tenant, status, and approval metadata', async () => {
    const response = await createDraft({
      localId: IDS.local28, status: 'SENT', approvedById: IDS.local28Leader,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.localId, IDS.local27);
    assert.equal(response.body.data.status, 'DRAFT');
    assert.equal(response.body.data.approvedById, null);
  });

  test('another local cannot view or modify a draft', async () => {
    const draft = await createDraft();
    const id = draft.body.data.id;
    assert.equal((await request(app).get(`/api/announcements/${id}`).set(bearer(leader28Token))).status, 404);
    assert.equal((await request(app).patch(`/api/announcements/${id}`).set(bearer(leader28Token)).send({ title: 'No' })).status, 404);
  });

  test('members cannot create, approve, or send announcements', async () => {
    const draft = await createDraft();
    const id = draft.body.data.id;
    assert.equal((await request(app).post('/api/announcements').set(bearer(member27Token)).send({ title: 'No', body: 'No' })).status, 403);
    assert.equal((await request(app).post(`/api/announcements/${id}/approve`).set(bearer(member27Token))).status, 403);
    assert.equal((await request(app).post(`/api/announcements/${id}/send`).set(bearer(member27Token))).status, 403);
  });

  test('approval requires submission and sending requires approval', async () => {
    const draft = await createDraft();
    const id = draft.body.data.id;
    assert.equal((await request(app).post(`/api/announcements/${id}/approve`).set(bearer(leader27Token))).status, 409);
    assert.equal((await request(app).post(`/api/announcements/${id}/send`).set(bearer(leader27Token))).status, 409);
  });

  test('submission and approval are idempotent and audited once', async () => {
    const draft = await createDraft();
    const id = draft.body.data.id;
    const submitResponses = await Promise.all([
      request(app).post(`/api/announcements/${id}/submit`).set(bearer(leader27Token)),
      request(app).post(`/api/announcements/${id}/submit`).set(bearer(leader27Token)),
    ]);
    assert.ok(submitResponses.every((response) => response.status === 200));
    const approvals = await Promise.all([
      request(app).post(`/api/announcements/${id}/approve`).set(bearer(leader27Token)),
      request(app).post(`/api/announcements/${id}/approve`).set(bearer(leader27Token)),
    ]);
    assert.ok(approvals.every((response) => response.status === 200));
    const grouped = await prisma.auditLog.groupBy({
      by: ['action'], where: { resourceId: id }, _count: { _all: true },
    });
    const counts = Object.fromEntries(grouped.map((row) => [row.action, row._count._all]));
    assert.equal(counts.ANNOUNCEMENT_SUBMITTED, 1);
    assert.equal(counts.ANNOUNCEMENT_APPROVED, 1);
  });

  test('approved content and targeting cannot be edited', async () => {
    const draft = await createDraft();
    const id = draft.body.data.id;
    await approve(id);
    const response = await request(app).patch(`/api/announcements/${id}`)
      .set(bearer(leader27Token)).send({ classificationFilter: null, body: 'Changed' });
    assert.equal(response.status, 409);
  });
});

describe('database-first sending and targeting', () => {
  let announcementId;

  test('concurrent sends create one local-only snapshot and one intent per recipient', async () => {
    const draft = await createDraft();
    announcementId = draft.body.data.id;
    await approve(announcementId);
    const responses = await Promise.all([
      request(app).post(`/api/announcements/${announcementId}/send`).set(bearer(leader27Token)),
      request(app).post(`/api/announcements/${announcementId}/send`).set(bearer(leader27Token)),
    ]);
    assert.ok(responses.every((response) => response.status === 202));
    const recipients = await prisma.announcementRecipient.findMany({
      where: { announcementId }, include: { member: true, outbox: true },
    });
    assert.equal(recipients.length, 2);
    assert.ok(recipients.every((row) => row.localId === IDS.local27));
    assert.ok(recipients.every((row) => row.member.classification === 'Phase4 Tiny Audience'));
    assert.ok(recipients.every((row) => row.outbox));
    assert.equal(await prisma.auditLog.count({ where: { resourceId: announcementId, action: 'ANNOUNCEMENT_SEND_INITIATED' } }), 1);
  });

  test('a repeated send cannot resnapshot members added later', async () => {
    await prisma.member.create({
      data: {
        id: '27000000-f400-4000-8000-000000000003', localId: IDS.local27,
        fullName: 'Late Member', email: 'phase4-late@example.test',
        classification: 'Phase4 Tiny Audience', status: 'ACTIVE',
      },
    });
    const response = await request(app).post(`/api/announcements/${announcementId}/send`).set(bearer(leader27Token));
    assert.equal(response.status, 202);
    assert.equal(response.body.data.alreadyStarted, true);
    assert.equal(await prisma.announcementRecipient.count({ where: { announcementId } }), 2);
  });

  test('Redis enqueue failure leaves durable intents recoverable', async () => {
    const result = await publishPendingOutbox({
      announcementId,
      db: prisma,
      queue: { add: async () => { throw new Error('redis unavailable'); } },
    });
    assert.equal(result.published, 0);
    assert.equal(await prisma.notificationOutbox.count({ where: { recipient: { announcementId }, status: 'PENDING' } }), 2);
    const publishedIds = [];
    const recovered = await publishPendingOutbox({
      announcementId,
      db: prisma,
      queue: { add: async (_name, data) => publishedIds.push(data.outboxId) },
    });
    assert.equal(recovered.published, 2);
    assert.equal(new Set(publishedIds).size, 2);
  });

  test('publisher recovers stale processing work with stable per-recipient job IDs', async () => {
    const fixture = await createFinalizationFixture({ statuses: ['PROCESSING'] });
    await prisma.notificationOutbox.update({
      where: { id: fixture.outboxes[0].id },
      data: { updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    const jobs = [];
    const result = await publishPendingOutbox({
      announcementId: fixture.announcement.id,
      db: prisma,
      now: new Date('2026-10-26T00:00:00.000Z'),
      queue: {
        add: async (name, data, options) => jobs.push({ name, data, options }),
      },
    });

    assert.deepEqual(result, { discovered: 1, published: 1 });
    assert.equal(jobs[0].name, 'simulate-notification');
    assert.equal(jobs[0].data.outboxId, fixture.outboxes[0].id);
    assert.equal(jobs[0].options.jobId, fixture.outboxes[0].id);
    assert.equal(jobs[0].options.attempts, env.notificationMaxAttempts);
    assert.equal((await prisma.notificationOutbox.findUnique({
      where: { id: fixture.outboxes[0].id },
    })).status, 'QUEUED');
  });

  test('publisher does not duplicate recent processing or terminal work', async () => {
    const processing = await createFinalizationFixture({ statuses: ['PROCESSING'] });
    const completed = await createFinalizationFixture({ statuses: ['COMPLETED'] });
    const jobs = [];
    const queue = { add: async (...args) => jobs.push(args) };
    const now = new Date();

    assert.deepEqual(await publishPendingOutbox({
      announcementId: processing.announcement.id, db: prisma, queue, now,
    }), { discovered: 0, published: 0 });
    assert.deepEqual(await publishPendingOutbox({
      announcementId: completed.announcement.id, db: prisma, queue, now,
    }), { discovered: 0, published: 0 });
    assert.equal(jobs.length, 0);
  });

  test('repeated and concurrent worker jobs create one dispatch per recipient', async () => {
    const outboxes = await prisma.notificationOutbox.findMany({
      where: { recipient: { announcementId } }, select: { id: true },
    });
    await Promise.all([
      deliverOutbox(outboxes[0].id),
      deliverOutbox(outboxes[0].id),
    ]);
    await deliverOutbox(outboxes[0].id);
    assert.equal(await prisma.notificationDispatch.count({ where: { recipient: { announcementId } } }), 1);
    await deliverOutbox(outboxes[1].id);
    assert.equal(await prisma.notificationDispatch.count({ where: { recipient: { announcementId } } }), 2);
  });

  test('status is persisted, trustworthy, tenant-scoped, and completes only after delivery', async () => {
    const response = await request(app).get(`/api/announcements/${announcementId}/status`).set(bearer(leader27Token));
    assert.equal(response.status, 200);
    assert.deepEqual(
      {
        status: response.body.data.status,
        totalRecipients: response.body.data.totalRecipients,
        pending: response.body.data.pending,
        completed: response.body.data.completed,
        failed: response.body.data.failed,
      },
      { status: 'SENT', totalRecipients: 2, pending: 0, completed: 2, failed: 0 },
    );
    assert.equal((await request(app).get(`/api/announcements/${announcementId}/status`).set(bearer(leader28Token))).status, 404);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: announcementId, action: 'ANNOUNCEMENT_SEND_COMPLETED' } }), 1);
  });

  test('all-active targeting stays inside the authenticated local', async () => {
    const expected = await prisma.member.count({ where: { localId: IDS.local27, status: 'ACTIVE' } });
    const id = await createApprovedSend(null);
    assert.equal(await prisma.announcementRecipient.count({ where: { announcementId: id } }), expected);
    assert.equal(await prisma.announcementRecipient.count({ where: { announcementId: id, localId: IDS.local28 } }), 0);
  });

  test('an empty audience rolls back recipient and outbox creation', async () => {
    const draft = await createDraft({ classificationFilter: 'No Such Classification' });
    const id = draft.body.data.id;
    await approve(id);
    const response = await request(app).post(`/api/announcements/${id}/send`).set(bearer(leader27Token));
    assert.equal(response.status, 409);
    assert.equal(await prisma.announcementRecipient.count({ where: { announcementId: id } }), 0);
    assert.equal((await prisma.announcement.findUnique({ where: { id } })).status, 'APPROVED');
  });

  test('a failed simulated attempt remains recoverable and later completes once', async () => {
    await prisma.member.create({
      data: {
        id: '27000000-f400-4000-8000-000000000004', localId: IDS.local27,
        fullName: 'Retry Member', email: 'phase4-retry@example.test',
        classification: 'Phase4 Retry Audience', status: 'ACTIVE',
      },
    });
    const id = await createApprovedSend('Phase4 Retry Audience');
    const outbox = await prisma.notificationOutbox.findFirst({ where: { recipient: { announcementId: id } } });
    await assert.rejects(deliverOutbox(outbox.id, {
      simulateDelivery: async () => { throw new Error('controlled failure'); },
    }));
    const retryable = await prisma.notificationOutbox.findUnique({ where: { id: outbox.id } });
    assert.equal(retryable.status, 'PENDING');
    assert.equal(retryable.attemptCount, 1);
    await deliverOutbox(outbox.id);
    assert.equal(await prisma.notificationDispatch.count({ where: { recipient: { announcementId: id } } }), 1);
    assert.equal((await prisma.announcement.findUnique({ where: { id } })).status, 'SENT');
  });

  test('an existing dispatch is reconciled without a duplicate', async () => {
    await prisma.member.create({
      data: {
        id: '27000000-f400-4000-8000-000000000005', localId: IDS.local27,
        fullName: 'Reconcile Member', email: 'phase4-reconcile@example.test',
        classification: 'Phase4 Reconcile Audience', status: 'ACTIVE',
      },
    });
    const id = await createApprovedSend('Phase4 Reconcile Audience');
    const outbox = await prisma.notificationOutbox.findFirst({
      where: { recipient: { announcementId: id } }, include: { recipient: true },
    });
    await prisma.notificationDispatch.create({
      data: { localId: IDS.local27, recipientId: outbox.recipientId, dispatchedAt: new Date() },
    });
    const result = await deliverOutbox(outbox.id);
    assert.equal(result.outcome, 'reconciled');
    assert.equal(await prisma.notificationDispatch.count({ where: { recipient: { announcementId: id } } }), 1);
    assert.equal((await prisma.notificationOutbox.findUnique({ where: { id: outbox.id } })).status, 'COMPLETED');
  });

  test('retry exhaustion records one terminal failure and finalizes once', async () => {
    const fixture = await createFinalizationFixture({ statuses: ['PENDING'] });
    const failure = async () => { throw new Error('controlled terminal failure'); };

    for (let attempt = 0; attempt < env.notificationMaxAttempts; attempt += 1) {
      await assert.rejects(deliverOutbox(fixture.outboxes[0].id, {
        simulateDelivery: failure,
      }));
    }

    const outbox = await prisma.notificationOutbox.findUnique({
      where: { id: fixture.outboxes[0].id },
      include: { recipient: true },
    });
    assert.equal(outbox.status, 'FAILED');
    assert.equal(outbox.attemptCount, env.notificationMaxAttempts);
    assert.equal(outbox.recipient.deliveryStatus, 'FAILED');
    assert.equal((await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    })).status, 'FAILED');
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: fixture.announcement.id } },
    }), 0);
    assert.equal(await prisma.auditLog.count({
      where: { resourceId: fixture.announcement.id, action: 'ANNOUNCEMENT_SEND_FAILED' },
    }), 1);

    assert.deepEqual(await deliverOutbox(fixture.outboxes[0].id), {
      outcome: 'terminal-failure',
    });
    assert.equal((await prisma.notificationOutbox.findUnique({
      where: { id: fixture.outboxes[0].id },
    })).attemptCount, env.notificationMaxAttempts);
    assert.equal(await prisma.auditLog.count({
      where: { resourceId: fixture.announcement.id, action: 'ANNOUNCEMENT_SEND_FAILED' },
    }), 1);
  });
});

describe('post-commit announcement finalization and recovery', () => {
  test('concurrent workers completing the final two recipients finalize exactly once', async () => {
    const fixture = await createFinalizationFixture({ statuses: ['PENDING', 'PENDING'] });
    await Promise.all(fixture.outboxes.map((outbox) => deliverOutbox(outbox.id)));
    const announcement = await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    });
    assert.equal(announcement.status, 'SENT');
    assert.ok(announcement.sentAt);
    assert.equal(await prisma.auditLog.count({
      where: {
        resourceId: announcement.id,
        action: 'ANNOUNCEMENT_SEND_COMPLETED',
      },
    }), 1);
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: announcement.id } },
    }), 2);
  });

  test('concurrent reconciliation recovers 180 completed records with one audit', async () => {
    const fixture = await createFinalizationFixture({
      localId: IDS.local28,
      createdById: IDS.local28Leader,
      statuses: Array.from({ length: 180 }, () => 'COMPLETED'),
    });
    assert.equal(fixture.announcement.status, 'SENDING');
    await Promise.all(Array.from({ length: 4 }, () => reconcileSendingAnnouncements({
      db: prisma,
      staleBefore: new Date(),
      limit: 100,
    })));
    const announcement = await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    });
    assert.equal(announcement.status, 'SENT');
    assert.ok(announcement.sentAt);
    assert.equal(await prisma.auditLog.count({
      where: {
        resourceId: announcement.id,
        action: 'ANNOUNCEMENT_SEND_COMPLETED',
      },
    }), 1);
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: announcement.id } },
    }), 180);
  });

  test('reconciliation recovers a crash after dispatch commit without duplicating dispatch', async () => {
    const fixture = await createFinalizationFixture({ statuses: ['PENDING'] });
    await assert.rejects(deliverOutbox(fixture.outboxes[0].id, {
      finalizeAfterCommit: async () => {
        throw new Error('simulated process exit before finalization');
      },
    }));
    assert.equal((await prisma.notificationOutbox.findUnique({
      where: { id: fixture.outboxes[0].id },
    })).status, 'COMPLETED');
    assert.equal((await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    })).status, 'SENDING');
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: fixture.announcement.id } },
    }), 1);

    await reconcileSendingAnnouncements({ db: prisma, staleBefore: new Date(), limit: 100 });
    assert.equal((await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    })).status, 'SENT');
    assert.equal(await prisma.notificationDispatch.count({
      where: { recipient: { announcementId: fixture.announcement.id } },
    }), 1);
  });

  test('pending records prevent premature finalization', async () => {
    const fixture = await createFinalizationFixture({ statuses: ['COMPLETED', 'PENDING'] });
    const result = await finalizeAnnouncement(prisma, fixture.announcement.id);
    assert.equal(result.outcome, 'pending');
    assert.equal((await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    })).status, 'SENDING');
    assert.equal(await prisma.auditLog.count({
      where: { resourceId: fixture.announcement.id, action: 'ANNOUNCEMENT_SEND_COMPLETED' },
    }), 0);
  });

  test('terminal failed records apply the documented failure policy exactly once', async () => {
    const fixture = await createFinalizationFixture({ statuses: ['COMPLETED', 'FAILED'] });
    await Promise.all([
      finalizeAnnouncement(prisma, fixture.announcement.id),
      finalizeAnnouncement(prisma, fixture.announcement.id),
      finalizeAnnouncement(prisma, fixture.announcement.id),
    ]);
    const announcement = await prisma.announcement.findUnique({
      where: { id: fixture.announcement.id },
    });
    assert.equal(announcement.status, 'FAILED');
    assert.equal(announcement.sentAt, null);
    assert.equal(await prisma.auditLog.count({
      where: { resourceId: announcement.id, action: 'ANNOUNCEMENT_SEND_FAILED' },
    }), 1);
  });
});

test('22,400-recipient send creates one durable snapshot and outbox intent per member', {
  skip: process.env.RUN_LARGE_AUDIENCE_TEST !== 'true',
}, async () => {
  const audienceSize = 22400;
  const classification = 'Phase4 Scale Audience';
  const batchSize = 1000;

  for (let offset = 0; offset < audienceSize; offset += batchSize) {
    const size = Math.min(batchSize, audienceSize - offset);
    await prisma.member.createMany({
      data: Array.from({ length: size }, (_value, index) => {
        const number = offset + index;
        return {
          id: randomUUID(),
          localId: IDS.local27,
          fullName: `Scale Member ${String(number).padStart(5, '0')}`,
          email: `phase4-scale-${number}@example.test`,
          classification,
          status: 'ACTIVE',
        };
      }),
    });
  }

  const draft = await createDraft({ classificationFilter: classification });
  await approve(draft.body.data.id);
  const first = await request(app)
    .post(`/api/announcements/${draft.body.data.id}/send`)
    .set(bearer(leader27Token));
  assert.equal(first.status, 202);
  assert.equal(first.body.data.totalRecipients, audienceSize);
  assert.equal(await prisma.announcementRecipient.count({
    where: { announcementId: draft.body.data.id },
  }), audienceSize);
  assert.equal(await prisma.notificationOutbox.count({
    where: { recipient: { announcementId: draft.body.data.id } },
  }), audienceSize);

  const repeated = await request(app)
    .post(`/api/announcements/${draft.body.data.id}/send`)
    .set(bearer(leader27Token));
  assert.equal(repeated.status, 202);
  assert.equal(repeated.body.data.alreadyStarted, true);
  assert.equal(await prisma.announcementRecipient.count({
    where: { announcementId: draft.body.data.id },
  }), audienceSize);
});
