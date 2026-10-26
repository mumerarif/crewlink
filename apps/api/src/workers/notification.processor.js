const { deliverOutbox } = require('../modules/announcements/notification.service');

async function processNotification(job) {
  if (!job?.data?.outboxId) throw new Error('Notification job is missing outboxId');
  return deliverOutbox(job.data.outboxId);
}

module.exports = processNotification;
