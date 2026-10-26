const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { IDS, TEST_ACCOUNTS } = require('../prisma/seed-data');

const prisma = new PrismaClient();
const FIXTURE = {
  localA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  localB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userA: 'aaaaaaaa-0000-4000-8000-000000000001',
  userB: 'bbbbbbbb-0000-4000-8000-000000000001',
  memberA: 'aaaaaaaa-0000-4000-8000-000000000002',
  memberB: 'bbbbbbbb-0000-4000-8000-000000000002',
  concurrentMember: 'aaaaaaaa-0000-4000-8000-000000000003',
  announcementA: 'aaaaaaaa-0000-4000-8000-000000000004',
  announcementB: 'bbbbbbbb-0000-4000-8000-000000000004',
  recipientA: 'aaaaaaaa-0000-4000-8000-000000000005',
  recipientB: 'bbbbbbbb-0000-4000-8000-000000000005',
};

const fixtureLocalIds = [FIXTURE.localA, FIXTURE.localB];

async function cleanupFixtures() {
  await prisma.notificationDispatch.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.notificationOutbox.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.announcementRecipient.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.announcement.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.member.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.auditLog.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.user.deleteMany({ where: { localId: { in: fixtureLocalIds } } });
  await prisma.local.deleteMany({ where: { id: { in: fixtureLocalIds } } });
}

before(async () => {
  await cleanupFixtures();
  await prisma.local.createMany({
    data: [
      { id: FIXTURE.localA, name: 'Integration Local A' },
      { id: FIXTURE.localB, name: 'Integration Local B' },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: FIXTURE.userA,
        localId: FIXTURE.localA,
        email: 'integration-a@example.test',
        passwordHash: '$2b$10$integrationhashplaceholderaaaaaaaaaaaaaaaaaaaaaa',
        role: 'LEADER',
      },
      {
        id: FIXTURE.userB,
        localId: FIXTURE.localB,
        email: 'integration-b@example.test',
        passwordHash: '$2b$10$integrationhashplaceholderbbbbbbbbbbbbbbbbbbbbbb',
        role: 'LEADER',
      },
    ],
  });
  await prisma.member.createMany({
    data: [
      {
        id: FIXTURE.memberA,
        localId: FIXTURE.localA,
        fullName: 'Integration Member A',
        email: 'integration-member-a@example.test',
        classification: 'Journeyman Wireman',
        status: 'ACTIVE',
      },
      {
        id: FIXTURE.memberB,
        localId: FIXTURE.localB,
        fullName: 'Integration Member B',
        email: 'integration-member-b@example.test',
        classification: 'Transit Operator',
        status: 'ACTIVE',
      },
      {
        id: FIXTURE.concurrentMember,
        localId: FIXTURE.localA,
        fullName: 'Concurrent Integration Member',
        email: 'integration-concurrent@example.test',
        classification: 'Journeyman Wireman',
        status: 'ACTIVE',
      },
    ],
  });
  await prisma.announcement.createMany({
    data: [
      {
        id: FIXTURE.announcementA,
        localId: FIXTURE.localA,
        createdById: FIXTURE.userA,
        title: 'Integration Announcement A',
        body: 'Valid fixture announcement.',
      },
      {
        id: FIXTURE.announcementB,
        localId: FIXTURE.localB,
        createdById: FIXTURE.userB,
        title: 'Integration Announcement B',
        body: 'Valid fixture announcement.',
      },
    ],
  });
  await prisma.announcementRecipient.createMany({
    data: [
      {
        id: FIXTURE.recipientA,
        localId: FIXTURE.localA,
        announcementId: FIXTURE.announcementA,
        memberId: FIXTURE.memberA,
      },
      {
        id: FIXTURE.recipientB,
        localId: FIXTURE.localB,
        announcementId: FIXTURE.announcementB,
        memberId: FIXTURE.memberB,
      },
    ],
  });
});

after(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('schema integrity', () => {
  test('valid tenant relationships persist', async () => {
    const announcement = await prisma.announcement.findUnique({
      where: { id: FIXTURE.announcementA },
      include: { createdBy: true, recipients: true },
    });
    assert.equal(announcement.createdBy.localId, FIXTURE.localA);
    assert.equal(announcement.recipients.length, 1);
  });

  test('PostgreSQL rejects invalid enum values', async () => {
    await assert.rejects(
      prisma.$executeRawUnsafe(
        `INSERT INTO "users" ("id", "local_id", "email", "password_hash", "role", "updated_at") VALUES ('${randomUUID()}', '${FIXTURE.localA}', 'invalid-enum@example.test', 'hash', 'ADMIN', NOW())`,
      ),
    );
  });

  test('required foreign keys are enforced', async () => {
    await assert.rejects(
      prisma.member.create({
        data: {
          localId: randomUUID(),
          fullName: 'Missing Local',
          email: 'missing-local@example.test',
          classification: 'Journeyman Wireman',
        },
      }),
      (error) => error.code === 'P2003',
    );
  });

  test('database check constraints reject invalid scalar values', async () => {
    await assert.rejects(
      prisma.notificationOutbox.create({
        data: {
          localId: FIXTURE.localA,
          recipientId: FIXTURE.recipientA,
          attemptCount: -1,
        },
      }),
    );
    await assert.rejects(
      prisma.announcement.create({
        data: {
          localId: FIXTURE.localA,
          createdById: FIXTURE.userA,
          title: 'Preview too long',
          body: 'The database must reject this preview.',
          pushPreview: 'x'.repeat(121),
        },
      }),
    );
  });
});

describe('tenant consistency', () => {
  test('announcement cannot reference another local creator', async () => {
    await assert.rejects(
      prisma.announcement.create({
        data: {
          localId: FIXTURE.localA,
          createdById: FIXTURE.userB,
          title: 'Invalid creator',
          body: 'Cross-local association.',
        },
      }),
      (error) => error.code === 'P2003',
    );
  });

  test('recipient cannot reference another local member', async () => {
    await assert.rejects(
      prisma.announcementRecipient.create({
        data: {
          localId: FIXTURE.localA,
          announcementId: FIXTURE.announcementA,
          memberId: FIXTURE.memberB,
        },
      }),
      (error) => error.code === 'P2003',
    );
  });

  test('member cannot link to another local user', async () => {
    await assert.rejects(
      prisma.member.create({
        data: {
          localId: FIXTURE.localA,
          userId: FIXTURE.userB,
          fullName: 'Invalid linked member',
          email: 'invalid-linked-member@example.test',
          classification: 'Journeyman Wireman',
        },
      }),
      (error) => error.code === 'P2003',
    );
  });

  test('outbox cannot reference another local recipient', async () => {
    await assert.rejects(
      prisma.notificationOutbox.create({
        data: { localId: FIXTURE.localA, recipientId: FIXTURE.recipientB },
      }),
      (error) => error.code === 'P2003',
    );
  });
});

describe('duplicate prevention', () => {
  test('duplicate announcement/member recipient is rejected', async () => {
    await assert.rejects(
      prisma.announcementRecipient.create({
        data: {
          localId: FIXTURE.localA,
          announcementId: FIXTURE.announcementA,
          memberId: FIXTURE.memberA,
        },
      }),
      (error) => error.code === 'P2002',
    );
  });

  test('duplicate outbox intent is rejected', async () => {
    await prisma.notificationOutbox.create({
      data: { localId: FIXTURE.localA, recipientId: FIXTURE.recipientA },
    });
    await assert.rejects(
      prisma.notificationOutbox.create({
        data: { localId: FIXTURE.localA, recipientId: FIXTURE.recipientA },
      }),
      (error) => error.code === 'P2002',
    );
  });

  test('duplicate simulated dispatch is rejected', async () => {
    await prisma.notificationDispatch.create({
      data: {
        localId: FIXTURE.localA,
        recipientId: FIXTURE.recipientA,
        dispatchedAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.notificationDispatch.create({
        data: {
          localId: FIXTURE.localA,
          recipientId: FIXTURE.recipientA,
          dispatchedAt: new Date(),
        },
      }),
      (error) => error.code === 'P2002',
    );
  });

  test('concurrent duplicate inserts persist exactly one recipient', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        prisma.announcementRecipient.create({
          data: {
            id: randomUUID(),
            localId: FIXTURE.localA,
            announcementId: FIXTURE.announcementA,
            memberId: FIXTURE.concurrentMember,
          },
        }),
      ),
    );

    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 7);
    assert.equal(
      await prisma.announcementRecipient.count({
        where: {
          announcementId: FIXTURE.announcementA,
          memberId: FIXTURE.concurrentMember,
        },
      }),
      1,
    );
  });

  test('concurrent simulated dispatch attempts persist exactly one record', async () => {
    const recipient = await prisma.announcementRecipient.findUniqueOrThrow({
      where: {
        announcementId_memberId: {
          announcementId: FIXTURE.announcementA,
          memberId: FIXTURE.concurrentMember,
        },
      },
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        prisma.notificationDispatch.create({
          data: {
            id: randomUUID(),
            localId: FIXTURE.localA,
            recipientId: recipient.id,
            dispatchedAt: new Date(),
          },
        }),
      ),
    );

    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 7);
    assert.equal(
      await prisma.notificationDispatch.count({ where: { recipientId: recipient.id } }),
      1,
    );
  });
});

describe('re-runnable seed', () => {
  test('seeded identities and counts remain stable after two runs', async () => {
    assert.equal(await prisma.member.count({ where: { localId: IDS.local27 } }), 2000);
    assert.equal(await prisma.member.count({ where: { localId: IDS.local28 } }), 200);
    assert.equal(await prisma.user.count({ where: { id: { in: TEST_ACCOUNTS.map(({ id }) => id) } } }), 4);
    assert.equal(
      await prisma.announcementRecipient.count({
        where: { announcementId: IDS.sentAnnouncement },
      }),
      500,
    );
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { recipient: { announcementId: IDS.sentAnnouncement } },
      }),
      500,
    );
    assert.equal(
      await prisma.notificationDispatch.count({
        where: { recipient: { announcementId: IDS.sentAnnouncement } },
      }),
      500,
    );

    const announcement = await prisma.announcement.findUnique({
      where: { id: IDS.sentAnnouncement },
    });
    assert.equal(announcement.status, 'SENT');
    assert.ok(await prisma.member.findUnique({ where: { id: IDS.local28CrossTenantMember } }));
  });

  test('seeded passwords are bcrypt hashes', async () => {
    for (const account of TEST_ACCOUNTS) {
      const user = await prisma.user.findUnique({ where: { id: account.id } });
      assert.notEqual(user.passwordHash, account.password);
      assert.equal(await bcrypt.compare(account.password, user.passwordHash), true);
    }
  });
});
