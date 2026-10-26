const Redis = require('ioredis');
const env = require('./env');

function createRedisConnection(options = {}) {
  const connection = new Redis(env.redisUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    ...(options.forWorker ? { maxRetriesPerRequest: null } : {}),
  });

  connection.on('error', (error) => {
    console.error('Redis connection error', { name: error.name, code: error.code });
  });

  return connection;
}

module.exports = { createRedisConnection };
