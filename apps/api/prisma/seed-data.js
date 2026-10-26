const IDS = Object.freeze({
  local27: '27272727-2727-4727-8727-272727272727',
  local28: '28282828-2828-4828-8828-282828282828',
  local27Leader: '27000000-0000-4000-8000-000000000001',
  local27MemberUser: '27000000-0000-4000-8000-000000000002',
  local28Leader: '28000000-0000-4000-8000-000000000001',
  local28MemberUser: '28000000-0000-4000-8000-000000000002',
  sentAnnouncement: '27000000-aaaa-4000-8000-000000000001',
  local28CrossTenantMember: '28000000-bbbb-4000-8000-000000000001',
});

const TEST_ACCOUNTS = Object.freeze([
  {
    id: IDS.local27Leader,
    localId: IDS.local27,
    email: 'leader27@example.test',
    password: 'CrewLink27Leader!',
    role: 'LEADER',
  },
  {
    id: IDS.local27MemberUser,
    localId: IDS.local27,
    email: 'member27@example.test',
    password: 'CrewLink27Member!',
    role: 'MEMBER',
  },
  {
    id: IDS.local28Leader,
    localId: IDS.local28,
    email: 'leader28@example.test',
    password: 'CrewLink28Leader!',
    role: 'LEADER',
  },
  {
    id: IDS.local28MemberUser,
    localId: IDS.local28,
    email: 'member28@example.test',
    password: 'CrewLink28Member!',
    role: 'MEMBER',
  },
]);

const CLASSIFICATIONS = Object.freeze([
  'Journeyman Wireman',
  'Apprentice 1st Year',
  'Apprentice 3rd Year',
  'Transit Operator',
]);

function deterministicId(localNumber, kind, index) {
  return `${localNumber}000000-0000-${kind}-9000-${String(index).padStart(12, '0')}`;
}

module.exports = { IDS, TEST_ACCOUNTS, CLASSIFICATIONS, deterministicId };
