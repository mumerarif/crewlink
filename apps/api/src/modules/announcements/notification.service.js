const prisma = require('../../config/database');
const env = require('../../config/env');

async function finalizeAnnouncement(db, announcementId) {
  return db.$transaction(async (tx) => {
    // Finalizers always lock the announcement first. Delivery transactions never lock
    // announcements, so this serializes finalizers without reversing a lock order.
    const announcements = await tx.$queryRaw`
      SELECT id, local_id AS "localId"
      FROM announcements
      WHERE id = ${announcementId}::uuid
        AND status = 'SENDING'::"AnnouncementStatus"
      FOR UPDATE
    `;
    if (announcements.length === 0) return { outcome: 'not-sending' };

    const [counts] = await tx.$queryRaw`
      SELECT
        COUNT(o.id)::int AS total,
        (COUNT(*) FILTER (WHERE o.status = 'COMPLETED'::"OutboxStatus"))::int AS completed,
        (COUNT(*) FILTER (WHERE o.status = 'FAILED'::"OutboxStatus"))::int AS failed,
        (COUNT(*) FILTER (
          WHERE o.status NOT IN ('COMPLETED'::"OutboxStatus", 'FAILED'::"OutboxStatus")
        ))::int AS active
      FROM notification_outbox o
      INNER JOIN announcement_recipients r ON r.id = o.recipient_id
      WHERE r.announcement_id = ${announcementId}::uuid
    `;

    if (counts.total === 0 || counts.active > 0) {
      return { outcome: 'pending', counts };
    }

    const finalStatus = counts.failed > 0 ? 'FAILED' : 'SENT';
    const updated = await tx.announcement.updateMany({
      where: { id: announcementId, status: 'SENDING' },
      data: {
        status: finalStatus,
        ...(finalStatus === 'SENT' ? { sentAt: new Date() } : { sentAt: null }),
      },
    });
    if (updated.count !== 1) return { outcome: 'not-sending' };

    await tx.auditLog.create({
      data: {
        localId: announcements[0].localId,
        actorId: null,
        action: finalStatus === 'SENT' ? 'ANNOUNCEMENT_SEND_COMPLETED' : 'ANNOUNCEMENT_SEND_FAILED',
        resourceType: 'ANNOUNCEMENT',
        resourceId: announcementId,
        metadata: { failed: counts.failed },
      },
    });
    return { outcome: finalStatus.toLowerCase(), counts };
  });
}

async function recordFailure(outboxId, error, db) {
  const terminalAnnouncementId = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, attempt_count AS "attemptCount"
      FROM notification_outbox WHERE id = ${outboxId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) return null;
    const current = await tx.notificationOutbox.findUnique({
      where: { id: outboxId },
      select: {
        status: true,
        recipient: { select: { id: true, localId: true, announcementId: true } },
      },
    });
    if (!current || current.status === 'COMPLETED') return null;
    const attempts = rows[0].attemptCount + 1;
    const terminal = attempts >= env.notificationMaxAttempts;
    await tx.notificationOutbox.update({
      where: { id: outboxId },
      data: {
        status: terminal ? 'FAILED' : 'PENDING',
        attemptCount: attempts,
        lastError: `${error.name || 'Error'}: simulated delivery failed`,
        nextAttemptAt: terminal ? null : new Date(Date.now() + Math.min(30000, 250 * 2 ** attempts)),
      },
    });
    if (terminal) {
      await tx.announcementRecipient.update({
        where: { id: current.recipient.id },
        data: { deliveryStatus: 'FAILED' },
      });
      return current.recipient.announcementId;
    }
    return null;
  });
  if (terminalAnnouncementId) await finalizeAnnouncement(db, terminalAnnouncementId);
}

async function deliverOutbox(
  outboxId,
  {
    db = prisma,
    simulateDelivery = async () => {},
    finalizeAfterCommit = finalizeAnnouncement,
  } = {},
) {
  let delivery;
  try {
    delivery = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM notification_outbox WHERE id = ${outboxId}::uuid FOR UPDATE`;
      const outbox = await tx.notificationOutbox.findUnique({
        where: { id: outboxId },
        select: {
          id: true,
          status: true,
          attemptCount: true,
          recipient: { select: { id: true, localId: true, announcementId: true, dispatch: true } },
        },
      });
      if (!outbox) return { outcome: 'missing', announcementId: null };
      if (outbox.status === 'COMPLETED') {
        return { outcome: 'already-completed', announcementId: outbox.recipient.announcementId };
      }
      if (outbox.status === 'FAILED' && outbox.attemptCount >= env.notificationMaxAttempts) {
        return { outcome: 'terminal-failure', announcementId: outbox.recipient.announcementId };
      }

      await tx.notificationOutbox.update({
        where: { id: outboxId },
        data: { status: 'PROCESSING' },
      });
      if (!outbox.recipient.dispatch) await simulateDelivery({ outboxId, recipientId: outbox.recipient.id });
      await tx.notificationDispatch.upsert({
        where: { recipientId: outbox.recipient.id },
        update: {},
        create: {
          localId: outbox.recipient.localId,
          recipientId: outbox.recipient.id,
          dispatchedAt: new Date(),
        },
      });
      await tx.announcementRecipient.update({
        where: { id: outbox.recipient.id },
        data: { deliveryStatus: 'SENT' },
      });
      await tx.notificationOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'COMPLETED',
          attemptCount: { increment: 1 },
          lastError: null,
          nextAttemptAt: null,
        },
      });
      return {
        outcome: outbox.recipient.dispatch ? 'reconciled' : 'dispatched',
        announcementId: outbox.recipient.announcementId,
      };
    });
  } catch (error) {
    await recordFailure(outboxId, error, db);
    throw error;
  }

  if (delivery.announcementId) {
    // This is intentionally outside the delivery transaction. If it fails or the
    // process exits here, a BullMQ retry or the periodic reconciler can repeat it.
    await finalizeAfterCommit(db, delivery.announcementId);
  }
  return { outcome: delivery.outcome };
}

async function reconcileSendingAnnouncements({
  db = prisma,
  staleBefore = new Date(Date.now() - env.outboxStaleMs),
  limit = 100,
} = {}) {
  const batchSize = Math.max(1, Math.min(500, limit));
  const candidates = await db.announcement.findMany({
    where: { status: 'SENDING', updatedAt: { lte: staleBefore } },
    select: { id: true },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
  });

  let finalized = 0;
  for (const candidate of candidates) {
    const result = await finalizeAnnouncement(db, candidate.id);
    if (result.outcome === 'sent' || result.outcome === 'failed') finalized += 1;
  }
  return { discovered: candidates.length, finalized };
}

function startAnnouncementFinalizer({ db = prisma } = {}) {
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileSendingAnnouncements({ db });
    } catch (error) {
      console.error('Announcement finalizer poll failed', { name: error.name, code: error.code });
    } finally {
      running = false;
    }
  };
  poll();
  const timer = setInterval(poll, env.outboxPollIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  deliverOutbox,
  finalizeAnnouncement,
  reconcileSendingAnnouncements,
  startAnnouncementFinalizer,
};
