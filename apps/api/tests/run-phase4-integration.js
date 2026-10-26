const { spawnSync } = require('node:child_process');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.test') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  console.error('TEST_DATABASE_URL is required for Phase 4 integration tests.');
  process.exit(1);
}
const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  console.error(`Refusing destructive Phase 4 tests against database "${databaseName}".`);
  process.exit(1);
}

const testEnv = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  REDIS_URL: 'redis://localhost:6379/15',
  NODE_ENV: 'test',
  JWT_SECRET: 'crewlink-phase4-integration-secret-at-least-32-characters',
  JWT_EXPIRES_IN: '1h',
  AI_DRAFT_MODE: 'mock',
  OPENROUTER_API_KEY: '',
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(), env: testEnv, stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed']);
run('npx', ['prisma', 'db', 'seed']);
run(process.execPath, ['--test', 'tests/phase4.integration.js']);
