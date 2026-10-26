const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/database');
const { closeNotificationQueue } = require('./queues/notification.queue');
const { startOutboxPublisher } = require('./queues/outbox.publisher');

const server = app.listen(env.port, () => {
  console.log(`CrewLink API ${env.instanceId} listening on port ${env.port}`);
});
const stopOutboxPublisher = startOutboxPublisher();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopOutboxPublisher();
  console.log(`${signal} received; shutting down API`);

  server.close(async (serverError) => {
    try {
      await prisma.$disconnect();
      await closeNotificationQueue();
    } catch (error) {
      console.error('Failed to disconnect Prisma', { name: error.name, code: error.code });
      process.exitCode = 1;
    }

    if (serverError) {
      console.error('HTTP server shutdown failed', serverError);
      process.exitCode = 1;
    }

    process.exit();
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
