const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

const connection = createRedisConnection();
const notificationQueue = new Queue('notifications', { connection });

async function closeNotificationQueue() {
  await notificationQueue.close();
  await connection.quit();
}

module.exports = { notificationQueue, closeNotificationQueue };
