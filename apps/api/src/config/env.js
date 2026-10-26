const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const REQUIRED_VARIABLES = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN'];

function readPositiveInteger(name, fallback) {
  const rawValue = process.env[name] || String(fallback);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function readBoolean(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be either true or false`);
}

function loadEnv() {
  const missing = REQUIRED_VARIABLES.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  if (!/^[1-9]\d*[smhd]$/.test(process.env.JWT_EXPIRES_IN)) {
    throw new Error('JWT_EXPIRES_IN must use a positive duration such as 15m or 1h');
  }

  const aiDraftMode = process.env.AI_DRAFT_MODE || 'mock';
  if (!['mock', 'openrouter'].includes(aiDraftMode)) {
    throw new Error('AI_DRAFT_MODE must be either mock or openrouter');
  }

  const nodeEnv = process.env.NODE_ENV || 'development';

  return Object.freeze({
    nodeEnv,
    port: readPositiveInteger('PORT', 3001),
    instanceId: process.env.INSTANCE_ID || 'api-1',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    jwtAlgorithm: 'HS256',
    jwtIssuer: 'crewlink-api',
    jwtAudience: 'crewlink-web',
    aiDraftMode,
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    openRouterTimeoutMs: readPositiveInteger('OPENROUTER_TIMEOUT_MS', 15000),
    outboxPollIntervalMs: readPositiveInteger('OUTBOX_POLL_INTERVAL_MS', 5000),
    outboxStaleMs: readPositiveInteger('OUTBOX_STALE_MS', 30000),
    notificationMaxAttempts: readPositiveInteger('NOTIFICATION_MAX_ATTEMPTS', 5),
    apiDocsEnabled: readBoolean('API_DOCS_ENABLED', nodeEnv !== 'production'),
  });
}

module.exports = loadEnv();
