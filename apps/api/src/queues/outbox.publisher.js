const prisma = require('../config/database');
const env = require('../config/env');

async function publishPendingOutbox({
  announcementId,
  db = prisma,
  queue,
  now = new Date(),
} = {}) {
  const selectedQueue = queue || require('./notification.queue').notificationQueue;
  const staleBefore = new Date(now.getTime() - env.outboxStaleMs);
  const records = await db.notificationOutbox.findMany({
    where: {
      ...(announcementId ? { recipient: { announcementId } } : {}),
      OR: [
        { status: 'PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: { in: ['QUEUED', 'PROCESSING'] }, updatedAt: { lte: staleBefore } },
      ],
    },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 250,
  });

  let published = 0;
  for (const record of records) {
    try {
      await selectedQueue.add(
        'simulate-notification',
        { outboxId: record.id },
        {
          jobId: record.id,
          attempts: env.notificationMaxAttempts,
          backoff: { type: 'exponential', delay: 250 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      await db.notificationOutbox.updateMany({
        where: { id: record.id, status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] } },
        data: { status: 'QUEUED', nextAttemptAt: null },
      });
      published += 1;
    } catch {
      // The database row remains recoverable; a later poll will retry it.
    }
  }
  return { discovered: records.length, published };
}

function startOutboxPublisher() {
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await publishPendingOutbox();
    } catch (error) {
      console.error('Outbox publisher poll failed', { name: error.name, code: error.code });
    } finally {
      running = false;
    }
  };
  poll();
  const timer = setInterval(poll, env.outboxPollIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { publishPendingOutbox, startOutboxPublisher };
