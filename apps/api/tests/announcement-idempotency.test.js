const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '../prisma/migrations/20261024170000_phase_2_database_foundation/migration.sql',
  ),
  'utf8',
);

test('migration contains durable duplicate-prevention indexes', () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "announcement_recipients_announcement_id_member_id_key"/,
  );
  assert.match(migration, /CREATE UNIQUE INDEX "notification_outbox_recipient_id_key"/);
  assert.match(migration, /CREATE UNIQUE INDEX "notification_dispatches_recipient_id_key"/);
});
