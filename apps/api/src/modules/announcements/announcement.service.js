const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { paginationFromQuery } = require('../../utils/pagination');
const { tenantWhere } = require('../../utils/tenantScope');
const env = require('../../config/env');

const announcementSelection = {
  id: true,
  localId: true,
  createdById: true,
  title: true,
  body: true,
  pushPreview: true,
  needsAck: true,
  rsvpEnabled: true,
  classificationFilter: true,
  status: true,
  approvedById: true,
  approvedAt: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
};

const memberAnnouncementSelection = {
  id: true,
  title: true,
  body: true,
  pushPreview: true,
  needsAck: true,
  rsvpEnabled: true,
  status: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
};

async function listAnnouncements(identity, query) {
  const { page, limit, skip } = paginationFromQuery(query);
  const where = tenantWhere(identity);
  const [announcements, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where,
      select: announcementSelection,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.announcement.count({ where }),
  ]);

  return {
    announcements,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function getAnnouncementForLeader(identity, announcementId) {
  const announcement = await prisma.announcement.findFirst({
    where: tenantWhere(identity, { id: announcementId }),
    select: {
      ...announcementSelection,
      _count: { select: { recipients: true } },
    },
  });

  if (!announcement) {
    throw new AppError('Resource not found', 404);
  }

  return announcement;
}

async function getAnnouncementForMember(identity, announcementId) {
  const member = await resolveMember(identity);

  const recipient = await prisma.announcementRecipient.findFirst({
    where: tenantWhere(identity, {
      announcementId,
      memberId: member.id,
      announcement: { status: 'SENT' },
    }),
    select: {
      deliveryStatus: true,
      readAt: true,
      acknowledgedAt: true,
      rsvpStatus: true,
      rsvpUpdatedAt: true,
      announcement: { select: memberAnnouncementSelection },
    },
  });

  if (!recipient) throw new AppError('Resource not found', 404);

  return {
    ...recipient.announcement,
    recipient: interactionState(recipient),
  };
}

async function resolveMember(identity) {
  const member = await prisma.member.findFirst({
    where: tenantWhere(identity, { userId: identity.id }),
    select: { id: true },
  });
  if (!member) throw new AppError('Resource not found', 404);
  return member;
}

function interactionState(recipient) {
  return {
    deliveryStatus: recipient.deliveryStatus,
    readAt: recipient.readAt,
    acknowledgedAt: recipient.acknowledgedAt,
    rsvpResponse: recipient.rsvpStatus,
    rsvpUpdatedAt: recipient.rsvpUpdatedAt,
  };
}

function encodeInboxCursor(recipient) {
  return Buffer.from(JSON.stringify({
    createdAt: recipient.createdAt.toISOString(),
    id: recipient.id,
  })).toString('base64url');
}

function decodeInboxCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (
      Number.isNaN(createdAt.getTime())
      || typeof parsed.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    ) {
      throw new Error('invalid cursor');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new AppError('Invalid pagination cursor', 400);
  }
}

async function listAnnouncementsForMember(identity, query) {
  const member = await resolveMember(identity);
  const limit = Number(query.limit || 20);
  const cursor = decodeInboxCursor(query.cursor);
  const where = tenantWhere(identity, {
    memberId: member.id,
    announcement: { status: 'SENT' },
    ...(query.read === 'read' ? { readAt: { not: null } } : {}),
    ...(query.read === 'unread' ? { readAt: null } : {}),
    ...(query.acknowledgment === 'acknowledged' ? { acknowledgedAt: { not: null } } : {}),
    ...(query.acknowledgment === 'unacknowledged' ? { acknowledgedAt: null } : {}),
    ...(cursor ? {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    } : {}),
  });
  const recipients = await prisma.announcementRecipient.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      deliveryStatus: true,
      readAt: true,
      acknowledgedAt: true,
      rsvpStatus: true,
      rsvpUpdatedAt: true,
      announcement: {
        select: {
          id: true,
          title: true,
          pushPreview: true,
          status: true,
          needsAck: true,
          rsvpEnabled: true,
          sentAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = recipients.length > limit;
  const page = recipients.slice(0, limit);
  return {
    items: page.map((recipient) => ({
      ...recipient.announcement,
      ...interactionState(recipient),
    })),
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore ? encodeInboxCursor(page[page.length - 1]) : null,
    },
  };
}

async function getMemberRecipient(identity, announcementId) {
  const member = await resolveMember(identity);
  const recipient = await prisma.announcementRecipient.findFirst({
    where: tenantWhere(identity, {
      announcementId,
      memberId: member.id,
      announcement: { status: 'SENT' },
    }),
    select: {
      id: true,
      deliveryStatus: true,
      readAt: true,
      acknowledgedAt: true,
      rsvpStatus: true,
      rsvpUpdatedAt: true,
      announcement: { select: { needsAck: true, rsvpEnabled: true } },
    },
  });
  if (!recipient) throw new AppError('Resource not found', 404);
  return { member, recipient };
}

async function markAnnouncementRead(identity, announcementId) {
  const { member } = await getMemberRecipient(identity, announcementId);
  const rows = await prisma.$queryRaw`
    UPDATE announcement_recipients r
    SET read_at = COALESCE(r.read_at, NOW()), updated_at = NOW()
    FROM announcements a
    WHERE r.announcement_id = ${announcementId}::uuid
      AND r.member_id = ${member.id}::uuid
      AND r.local_id = ${identity.localId}::uuid
      AND a.id = r.announcement_id
      AND a.local_id = r.local_id
      AND a.status = 'SENT'::"AnnouncementStatus"
    RETURNING r.delivery_status AS "deliveryStatus", r.read_at AS "readAt",
      r.acknowledged_at AS "acknowledgedAt", r.rsvp_status AS "rsvpStatus",
      r.rsvp_updated_at AS "rsvpUpdatedAt"
  `;
  if (rows.length === 0) throw new AppError('Resource not found', 404);
  return interactionState(rows[0]);
}

async function acknowledgeAnnouncement(identity, announcementId) {
  const { member, recipient } = await getMemberRecipient(identity, announcementId);
  if (!recipient.announcement.needsAck) {
    throw new AppError('Acknowledgment is not enabled for this announcement', 409);
  }
  const rows = await prisma.$queryRaw`
    UPDATE announcement_recipients r
    SET read_at = COALESCE(r.read_at, NOW()),
        acknowledged_at = COALESCE(r.acknowledged_at, NOW()),
        updated_at = NOW()
    FROM announcements a
    WHERE r.announcement_id = ${announcementId}::uuid
      AND r.member_id = ${member.id}::uuid
      AND r.local_id = ${identity.localId}::uuid
      AND a.id = r.announcement_id
      AND a.local_id = r.local_id
      AND a.status = 'SENT'::"AnnouncementStatus"
      AND a.needs_ack = true
    RETURNING r.delivery_status AS "deliveryStatus", r.read_at AS "readAt",
      r.acknowledged_at AS "acknowledgedAt", r.rsvp_status AS "rsvpStatus",
      r.rsvp_updated_at AS "rsvpUpdatedAt"
  `;
  if (rows.length === 0) throw new AppError('Resource not found', 404);
  return interactionState(rows[0]);
}

async function updateRsvp(identity, announcementId, response) {
  const { member, recipient } = await getMemberRecipient(identity, announcementId);
  if (!recipient.announcement.rsvpEnabled) {
    throw new AppError('RSVP is not enabled for this announcement', 409);
  }
  const rows = await prisma.$queryRaw`
    UPDATE announcement_recipients r
    SET rsvp_updated_at = CASE
          WHEN r.rsvp_status IS DISTINCT FROM ${response}::"RsvpResponse" THEN NOW()
          ELSE r.rsvp_updated_at
        END,
        rsvp_status = ${response}::"RsvpResponse",
        updated_at = NOW()
    FROM announcements a
    WHERE r.announcement_id = ${announcementId}::uuid
      AND r.member_id = ${member.id}::uuid
      AND r.local_id = ${identity.localId}::uuid
      AND a.id = r.announcement_id
      AND a.local_id = r.local_id
      AND a.status = 'SENT'::"AnnouncementStatus"
      AND a.rsvp_enabled = true
    RETURNING r.delivery_status AS "deliveryStatus", r.read_at AS "readAt",
      r.acknowledged_at AS "acknowledgedAt", r.rsvp_status AS "rsvpStatus",
      r.rsvp_updated_at AS "rsvpUpdatedAt"
  `;
  if (rows.length === 0) throw new AppError('Resource not found', 404);
  return interactionState(rows[0]);
}

function auditData(identity, announcementId, action, metadata) {
  return {
    localId: identity.localId,
    actorId: identity.id,
    action,
    resourceType: 'ANNOUNCEMENT',
    resourceId: announcementId,
    metadata,
  };
}

function editableData(input) {
  const data = {};
  for (const field of [
    'title', 'body', 'pushPreview', 'needsAck', 'rsvpEnabled', 'classificationFilter',
  ]) {
    if (Object.hasOwn(input, field)) data[field] = input[field];
  }
  return data;
}

async function lockAnnouncement(tx, identity, announcementId) {
  const rows = await tx.$queryRaw`
    SELECT id, status, classification_filter AS "classificationFilter"
    FROM announcements
    WHERE id = ${announcementId}::uuid AND local_id = ${identity.localId}::uuid
    FOR UPDATE
  `;
  if (rows.length === 0) throw new AppError('Resource not found', 404);
  return rows[0];
}

async function createAnnouncement(identity, input) {
  return prisma.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        localId: identity.localId,
        createdById: identity.id,
        ...editableData(input),
      },
      select: announcementSelection,
    });
    await tx.auditLog.create({
      data: auditData(identity, announcement.id, 'ANNOUNCEMENT_CREATED', {
        status: 'DRAFT',
      }),
    });
    return announcement;
  });
}

async function updateAnnouncement(identity, announcementId, input) {
  return prisma.$transaction(async (tx) => {
    const current = await lockAnnouncement(tx, identity, announcementId);
    if (current.status !== 'DRAFT') {
      throw new AppError('Only draft announcements can be edited', 409);
    }
    const announcement = await tx.announcement.update({
      where: { id: announcementId },
      data: editableData(input),
      select: announcementSelection,
    });
    await tx.auditLog.create({
      data: auditData(identity, announcementId, 'ANNOUNCEMENT_UPDATED', {
        fields: Object.keys(editableData(input)),
      }),
    });
    return announcement;
  });
}

async function submitAnnouncement(identity, announcementId) {
  return prisma.$transaction(async (tx) => {
    const current = await lockAnnouncement(tx, identity, announcementId);
    if (current.status === 'PENDING_APPROVAL') {
      return tx.announcement.findUnique({ where: { id: announcementId }, select: announcementSelection });
    }
    if (current.status !== 'DRAFT') {
      throw new AppError('Announcement cannot be submitted from its current state', 409);
    }
    const announcement = await tx.announcement.update({
      where: { id: announcementId },
      data: { status: 'PENDING_APPROVAL' },
      select: announcementSelection,
    });
    await tx.auditLog.create({
      data: auditData(identity, announcementId, 'ANNOUNCEMENT_SUBMITTED', {
        status: 'PENDING_APPROVAL',
      }),
    });
    return announcement;
  });
}

async function approveAnnouncement(identity, announcementId) {
  return prisma.$transaction(async (tx) => {
    const current = await lockAnnouncement(tx, identity, announcementId);
    if (current.status === 'APPROVED') {
      return tx.announcement.findUnique({ where: { id: announcementId }, select: announcementSelection });
    }
    if (current.status !== 'PENDING_APPROVAL') {
      throw new AppError('Announcement must be pending approval', 409);
    }
    const approvedAt = new Date();
    const announcement = await tx.announcement.update({
      where: { id: announcementId },
      data: { status: 'APPROVED', approvedById: identity.id, approvedAt },
      select: announcementSelection,
    });
    await tx.auditLog.create({
      data: auditData(identity, announcementId, 'ANNOUNCEMENT_APPROVED', {
        approvedAt: approvedAt.toISOString(),
      }),
    });
    return announcement;
  });
}

async function snapshotRecipients(tx, identity, announcementId, classificationFilter) {
  if (classificationFilter) {
    await tx.$executeRaw`
      INSERT INTO announcement_recipients
        (id, local_id, announcement_id, member_id, delivery_status, created_at, updated_at)
      SELECT gen_random_uuid(), m.local_id, ${announcementId}::uuid, m.id, 'PENDING'::"DeliveryStatus", NOW(), NOW()
      FROM members m
      WHERE m.local_id = ${identity.localId}::uuid
        AND m.status = 'ACTIVE'::"MemberStatus"
        AND m.classification = ${classificationFilter}
      ON CONFLICT (announcement_id, member_id) DO NOTHING
    `;
  } else {
    await tx.$executeRaw`
      INSERT INTO announcement_recipients
        (id, local_id, announcement_id, member_id, delivery_status, created_at, updated_at)
      SELECT gen_random_uuid(), m.local_id, ${announcementId}::uuid, m.id, 'PENDING'::"DeliveryStatus", NOW(), NOW()
      FROM members m
      WHERE m.local_id = ${identity.localId}::uuid
        AND m.status = 'ACTIVE'::"MemberStatus"
      ON CONFLICT (announcement_id, member_id) DO NOTHING
    `;
  }

  const totalRecipients = await tx.announcementRecipient.count({ where: { announcementId } });
  if (totalRecipients === 0) throw new AppError('The selected audience has no eligible members', 409);

  await tx.$executeRaw`
    INSERT INTO notification_outbox
      (id, local_id, recipient_id, status, attempt_count, created_at, updated_at)
    SELECT gen_random_uuid(), r.local_id, r.id, 'PENDING'::"OutboxStatus", 0, NOW(), NOW()
    FROM announcement_recipients r
    WHERE r.announcement_id = ${announcementId}::uuid
    ON CONFLICT (recipient_id) DO NOTHING
  `;
  return totalRecipients;
}

async function sendAnnouncement(identity, announcementId) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await lockAnnouncement(tx, identity, announcementId);
    if (['SENDING', 'SENT', 'FAILED'].includes(current.status)) {
      return { announcementId, status: current.status, alreadyStarted: true };
    }
    if (current.status !== 'APPROVED') {
      throw new AppError('Only approved announcements can be sent', 409);
    }

    const totalRecipients = await snapshotRecipients(
      tx,
      identity,
      announcementId,
      current.classificationFilter,
    );
    await tx.announcement.update({ where: { id: announcementId }, data: { status: 'SENDING' } });
    await tx.auditLog.create({
      data: auditData(identity, announcementId, 'ANNOUNCEMENT_SEND_INITIATED', {
        totalRecipients,
      }),
    });
    return { announcementId, status: 'SENDING', totalRecipients, alreadyStarted: false };
  }, { timeout: 30000 });

  if (env.nodeEnv !== 'test') {
    const { publishPendingOutbox } = require('../../queues/outbox.publisher');
    publishPendingOutbox({ announcementId }).catch(() => {});
  }
  return result;
}

async function getSendStatus(identity, announcementId) {
  const announcement = await prisma.announcement.findFirst({
    where: tenantWhere(identity, { id: announcementId }),
    select: { id: true, status: true, sentAt: true },
  });
  if (!announcement) throw new AppError('Resource not found', 404);

  const [totalRecipients, grouped] = await Promise.all([
    prisma.announcementRecipient.count({ where: { announcementId } }),
    prisma.notificationOutbox.groupBy({
      by: ['status'],
      where: { recipient: { announcementId, localId: identity.localId } },
      _count: { _all: true },
    }),
  ]);
  const counts = Object.fromEntries(grouped.map((group) => [group.status, group._count._all]));
  const completed = counts.COMPLETED || 0;
  const failed = counts.FAILED || 0;
  return {
    announcementId,
    status: announcement.status,
    totalRecipients,
    pending: Math.max(0, totalRecipients - completed - failed),
    completed,
    failed,
    sentAt: announcement.sentAt,
  };
}

async function getEngagement(identity, announcementId) {
  const announcement = await prisma.announcement.findFirst({
    where: tenantWhere(identity, { id: announcementId }),
    select: { id: true, needsAck: true, rsvpEnabled: true },
  });
  if (!announcement) throw new AppError('Resource not found', 404);

  const [counts] = await prisma.$queryRaw`
    SELECT
      COUNT(r.id)::int AS "totalRecipients",
      (COUNT(*) FILTER (WHERE o.status = 'COMPLETED'::"OutboxStatus"))::int AS "deliveryCompleted",
      (COUNT(*) FILTER (WHERE o.status = 'FAILED'::"OutboxStatus"))::int AS "deliveryFailed",
      (COUNT(*) FILTER (WHERE r.read_at IS NOT NULL))::int AS read,
      (COUNT(*) FILTER (WHERE r.acknowledged_at IS NOT NULL))::int AS acknowledged,
      (COUNT(*) FILTER (WHERE r.rsvp_status = 'YES'::"RsvpResponse"))::int AS yes,
      (COUNT(*) FILTER (WHERE r.rsvp_status = 'NO'::"RsvpResponse"))::int AS no,
      (COUNT(*) FILTER (WHERE r.rsvp_status = 'MAYBE'::"RsvpResponse"))::int AS maybe
    FROM announcement_recipients r
    LEFT JOIN notification_outbox o
      ON o.recipient_id = r.id AND o.local_id = r.local_id
    WHERE r.announcement_id = ${announcementId}::uuid
      AND r.local_id = ${identity.localId}::uuid
  `;
  const total = counts.totalRecipients;
  const rsvpResponses = counts.yes + counts.no + counts.maybe;
  return {
    announcementId,
    totalRecipients: total,
    delivery: {
      completed: counts.deliveryCompleted,
      pending: total - counts.deliveryCompleted - counts.deliveryFailed,
      failed: counts.deliveryFailed,
    },
    reads: { read: counts.read, unread: total - counts.read },
    acknowledgments: {
      required: announcement.needsAck,
      acknowledged: counts.acknowledged,
      outstanding: announcement.needsAck ? total - counts.acknowledged : 0,
    },
    rsvp: {
      enabled: announcement.rsvpEnabled,
      yes: announcement.rsvpEnabled ? counts.yes : 0,
      no: announcement.rsvpEnabled ? counts.no : 0,
      maybe: announcement.rsvpEnabled ? counts.maybe : 0,
      noResponse: announcement.rsvpEnabled ? total - rsvpResponses : 0,
    },
  };
}

module.exports = {
  listAnnouncements,
  getAnnouncementForLeader,
  getAnnouncementForMember,
  listAnnouncementsForMember,
  markAnnouncementRead,
  acknowledgeAnnouncement,
  updateRsvp,
  createAnnouncement,
  updateAnnouncement,
  submitAnnouncement,
  approveAnnouncement,
  sendAnnouncement,
  getSendStatus,
  getEngagement,
};
