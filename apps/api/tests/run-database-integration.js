const { spawnSync } = require('node:child_process');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.test') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.error('TEST_DATABASE_URL is required for database integration tests.');
  process.exit(1);
}

const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  console.error(`Refusing destructive integration tests against database "${databaseName}".`);
  process.exit(1);
}

const testEnv = { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: 'test' };

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: testEnv,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed']);
run('npx', ['prisma', 'db', 'seed']);
run('npx', ['prisma', 'db', 'seed']);
run(process.execPath, ['--test', 'tests/database.integration.js']);
