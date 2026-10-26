const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const processNotification = require('./notification.processor');
const prisma = require('../config/database');
const { startAnnouncementFinalizer } = require('../modules/announcements/notification.service');

const connection = createRedisConnection({ forWorker: true });
const worker = new Worker('notifications', processNotification, {
  connection,
  concurrency: 20,
});
const stopAnnouncementFinalizer = startAnnouncementFinalizer();

worker.on('ready', () => {
  console.log('Notification worker is ready');
});

worker.on('failed', (job, error) => {
  console.error('Notification job failed', {
    jobId: job ? job.id : 'unknown',
    name: error.name,
    code: error.code,
  });
});

worker.on('error', (error) => {
  console.error('Notification worker error', { name: error.name, code: error.code });
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopAnnouncementFinalizer();
  console.log(`${signal} received; shutting down notification worker`);

  try {
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Notification worker shutdown failed', { name: error.name, code: error.code });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = worker;
