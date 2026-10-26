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

test('migration contains composite tenant foreign keys', () => {
  const requiredConstraints = [
    'members_local_id_user_id_fkey',
    'announcements_local_id_created_by_id_fkey',
    'announcements_local_id_approved_by_id_fkey',
    'announcement_recipients_local_id_announcement_id_fkey',
    'announcement_recipients_local_id_member_id_fkey',
    'notification_outbox_local_id_recipient_id_fkey',
    'notification_dispatches_local_id_recipient_id_fkey',
  ];

  for (const constraint of requiredConstraints) {
    assert.match(migration, new RegExp(`CONSTRAINT "${constraint}"`));
  }
});
