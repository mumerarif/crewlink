const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { IDS, TEST_ACCOUNTS, CLASSIFICATIONS, deterministicId } = require('./seed-data');

const prisma = new PrismaClient();
const BATCH_SIZE = 500;
const SEEDED_AT = new Date('2026-01-15T12:00:00.000Z');

function memberStatus(index) {
  if (index % 20 === 0) return 'SUSPENDED';
  if (index % 10 === 0) return 'RETIRED';
  return 'ACTIVE';
}

function buildMembers(localNumber, localId, count, memberUserId) {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const loginMemberIndex = localNumber === '27' ? 1 : 2;
    const isCrossTenantFixture = localNumber === '28' && index === 1;
    const id = isCrossTenantFixture
      ? IDS.local28CrossTenantMember
      : deterministicId(localNumber, '4000', index);

    return {
      id,
      localId,
      userId: index === loginMemberIndex ? memberUserId : null,
      fullName: `Local ${localNumber} Member ${String(index).padStart(4, '0')}`,
      email:
        index === loginMemberIndex
          ? `member${localNumber}@example.test`
          : `member${localNumber}-${String(index).padStart(4, '0')}@example.test`,
      classification: CLASSIFICATIONS[offset % CLASSIFICATIONS.length],
      status: memberStatus(index),
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    };
  });
}

async function reconcileMemberLoginLinks() {
  const local27FirstMemberId = deterministicId('27', '4000', 1);
  const local27SecondMemberId = deterministicId('27', '4000', 2);
  const local28SecondMemberId = deterministicId('28', '4000', 2);

  await prisma.member.update({
    where: { id: local27SecondMemberId },
    data: { userId: null, email: 'member27-0002@example.test' },
  });
  await prisma.member.update({
    where: { id: local27FirstMemberId },
    data: { userId: IDS.local27MemberUser, email: 'member27@example.test' },
  });
  await prisma.member.update({
    where: { id: local28SecondMemberId },
    data: { userId: IDS.local28MemberUser, email: 'member28@example.test' },
  });
}

async function createManyInBatches(delegate, records) {
  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    await delegate.createMany({
      data: records.slice(offset, offset + BATCH_SIZE),
      skipDuplicates: true,
    });
  }
}

async function upsertLocals() {
  await prisma.local.upsert({
    where: { id: IDS.local27 },
    update: { name: 'Fictional Union Local 27' },
    create: { id: IDS.local27, name: 'Fictional Union Local 27', createdAt: SEEDED_AT },
  });
  await prisma.local.upsert({
    where: { id: IDS.local28 },
    update: { name: 'Fictional Union Local 28' },
    create: { id: IDS.local28, name: 'Fictional Union Local 28', createdAt: SEEDED_AT },
  });
}

async function upsertUsers() {
  for (const account of TEST_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const data = {
      localId: account.localId,
      email: account.email,
      passwordHash,
      role: account.role,
    };

    await prisma.user.upsert({
      where: { id: account.id },
      update: data,
      create: { id: account.id, ...data, createdAt: SEEDED_AT },
    });
  }
}

async function upsertSentAnnouncement() {
  const data = {
    localId: IDS.local27,
    createdById: IDS.local27Leader,
    title: 'January Journeyman Safety Meeting',
    body: 'A fictional safety meeting notice for seeded Local 27 journeymen.',
    pushPreview: 'Safety meeting notice for Local 27 journeymen.',
    needsAck: true,
    rsvpEnabled: true,
    classificationFilter: 'Journeyman Wireman',
    status: 'SENT',
    approvedById: IDS.local27Leader,
    approvedAt: SEEDED_AT,
    sentAt: SEEDED_AT,
  };

  await prisma.announcement.upsert({
    where: { id: IDS.sentAnnouncement },
    update: data,
    create: { id: IDS.sentAnnouncement, ...data, createdAt: SEEDED_AT },
  });
}

function buildDeliveryRecords(local27Members) {
  const targetedMembers = local27Members.filter(
    (member) => member.status === 'ACTIVE' && member.classification === 'Journeyman Wireman',
  );

  const recipients = targetedMembers.map((member, offset) => {
    const position = offset + 1;
    return {
      id: deterministicId('27', '4001', position),
      localId: IDS.local27,
      announcementId: IDS.sentAnnouncement,
      memberId: member.id,
      deliveryStatus: 'SENT',
      readAt: position % 2 === 0 ? SEEDED_AT : null,
      acknowledgedAt: position % 4 === 0 ? SEEDED_AT : null,
      rsvpStatus: position % 3 === 0 ? 'YES' : null,
      rsvpUpdatedAt: position % 3 === 0 ? SEEDED_AT : null,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    };
  });

  const outbox = recipients.map((recipient, offset) => ({
    id: deterministicId('27', '4002', offset + 1),
    localId: IDS.local27,
    recipientId: recipient.id,
    status: 'COMPLETED',
    attemptCount: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }));

  const dispatches = recipients.map((recipient, offset) => ({
    id: deterministicId('27', '4003', offset + 1),
    localId: IDS.local27,
    recipientId: recipient.id,
    dispatchedAt: SEEDED_AT,
    createdAt: SEEDED_AT,
  }));

  return { recipients, outbox, dispatches };
}

async function main() {
  const local27Members = buildMembers('27', IDS.local27, 2000, IDS.local27MemberUser);
  const local28Members = buildMembers('28', IDS.local28, 200, IDS.local28MemberUser);
  const deliveryRecords = buildDeliveryRecords(local27Members);

  await upsertLocals();
  await upsertUsers();
  await createManyInBatches(prisma.member, [...local27Members, ...local28Members]);
  await reconcileMemberLoginLinks();
  await upsertSentAnnouncement();
  await createManyInBatches(prisma.announcementRecipient, deliveryRecords.recipients);
  await createManyInBatches(prisma.notificationOutbox, deliveryRecords.outbox);
  await createManyInBatches(prisma.notificationDispatch, deliveryRecords.dispatches);

  const [local27Count, local28Count, recipientCount, outboxCount, dispatchCount] =
    await Promise.all([
    prisma.member.count({ where: { localId: IDS.local27 } }),
    prisma.member.count({ where: { localId: IDS.local28 } }),
    prisma.announcementRecipient.count({ where: { announcementId: IDS.sentAnnouncement } }),
    prisma.notificationOutbox.count({
      where: { recipient: { announcementId: IDS.sentAnnouncement } },
    }),
    prisma.notificationDispatch.count({
      where: { recipient: { announcementId: IDS.sentAnnouncement } },
    }),
    ]);

  console.log(
    JSON.stringify({
      locals: 2,
      users: TEST_ACCOUNTS.length,
      members: { local27: local27Count, local28: local28Count },
      sentAnnouncementId: IDS.sentAnnouncement,
      recipients: recipientCount,
      outboxIntents: outboxCount,
      dispatches: dispatchCount,
    }),
  );
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
