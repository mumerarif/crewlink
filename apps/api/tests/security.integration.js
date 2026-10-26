const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../src/app');
const { errorHandler } = require('../src/middlewares/errorHandler');
const { IDS, TEST_ACCOUNTS } = require('../prisma/seed-data');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_OPTIONS = {
  algorithm: 'HS256',
  issuer: 'crewlink-api',
  audience: 'crewlink-web',
};
const TEMP = {
  local28Announcement: '28000000-cccc-4000-8000-000000000001',
  local27UnassignedAnnouncement: '27000000-cccc-4000-8000-000000000001',
  deletedUser: '27000000-dddd-4000-8000-000000000001',
  unlinkedUser: '27000000-dddd-4000-8000-000000000002',
};

const accounts = Object.fromEntries(TEST_ACCOUNTS.map((account) => [account.email, account]));
let leader27Token;
let member27Token;
let leader28Token;
let member28Token;

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function signFor(account, overrides = {}, options = {}) {
  return jwt.sign(
    {
      localId: overrides.localId || account.localId,
      role: overrides.role || account.role,
    },
    options.secret || JWT_SECRET,
    {
      ...JWT_OPTIONS,
      expiresIn: options.expiresIn || '1h',
      subject: overrides.sub || account.id,
    },
  );
}

async function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

before(async () => {
  await prisma.announcement.deleteMany({
    where: { id: { in: [TEMP.local28Announcement, TEMP.local27UnassignedAnnouncement] } },
  });
  await prisma.announcement.createMany({
    data: [
      {
        id: TEMP.local28Announcement,
        localId: IDS.local28,
        createdById: IDS.local28Leader,
        title: 'Local 28 private integration announcement',
        body: 'Visible only inside Local 28.',
      },
      {
        id: TEMP.local27UnassignedAnnouncement,
        localId: IDS.local27,
        createdById: IDS.local27Leader,
        title: 'Local 27 unassigned integration announcement',
        body: 'Not assigned to the seeded member account.',
      },
    ],
  });
  await prisma.user.upsert({
    where: { id: TEMP.unlinkedUser },
    update: {},
    create: {
      id: TEMP.unlinkedUser,
      localId: IDS.local27,
      email: 'unlinked-member@example.test',
      passwordHash: '$2b$10$not-used-by-this-security-test-xxxxxxxxxxxxxxxxxxxx',
      role: 'MEMBER',
    },
  });

  [leader27Token, member27Token, leader28Token, member28Token] = await Promise.all([
    login('leader27@example.test', 'CrewLink27Leader!').then((response) => response.body.data.token),
    login('member27@example.test', 'CrewLink27Member!').then((response) => response.body.data.token),
    login('leader28@example.test', 'CrewLink28Leader!').then((response) => response.body.data.token),
    login('member28@example.test', 'CrewLink28Member!').then((response) => response.body.data.token),
  ]);
});

after(async () => {
  await prisma.announcement.deleteMany({
    where: { id: { in: [TEMP.local28Announcement, TEMP.local27UnassignedAnnouncement] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [TEMP.deletedUser, TEMP.unlinkedUser] } } });
  await prisma.$disconnect();
});

describe('authentication', () => {
  test('valid leader credentials return a short-lived JWT without a password hash', async () => {
    const response = await login(' LEADER27@EXAMPLE.TEST ', 'CrewLink27Leader!');
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.data.token, 'string');
    assert.equal(response.body.data.user.role, 'LEADER');
    assert.equal('passwordHash' in response.body.data.user, false);
    const decoded = jwt.verify(response.body.data.token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'crewlink-api',
      audience: 'crewlink-web',
    });
    assert.equal(decoded.sub, IDS.local27Leader);
    assert.ok(decoded.exp > decoded.iat);
  });

  test('valid member credentials return a JWT', async () => {
    const response = await login('member27@example.test', 'CrewLink27Member!');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.role, 'MEMBER');
  });

  test('current-user response is database-backed and sanitized', async () => {
    const response = await request(app).get('/api/auth/me').set(bearer(leader27Token));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      id: IDS.local27Leader,
      localId: IDS.local27,
      role: 'LEADER',
      email: 'leader27@example.test',
    });
    assert.equal('passwordHash' in response.body.data, false);
  });

  test('invalid and unknown credentials return the same generic error', async () => {
    const invalidPassword = await login('leader27@example.test', 'wrong-password');
    const unknownEmail = await login('unknown@example.test', 'wrong-password');
    assert.equal(invalidPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(invalidPassword.body.message, 'Invalid email or password');
    assert.deepEqual(unknownEmail.body, invalidPassword.body);
  });

  test('missing and malformed bearer credentials return 401', async () => {
    assert.equal((await request(app).get('/api/auth/me')).status, 401);
    assert.equal(
      (await request(app).get('/api/auth/me').set('Authorization', 'Basic abc')).status,
      401,
    );
    assert.equal(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer malformed')).status,
      401,
    );
  });

  test('expired and incorrectly signed tokens return 401', async () => {
    const account = accounts['leader27@example.test'];
    const expired = signFor(account, {}, { expiresIn: -1 });
    const wrongSignature = signFor(account, {}, { secret: 'different-secret-that-is-long-enough-for-testing' });
    assert.equal((await request(app).get('/api/auth/me').set(bearer(expired))).status, 401);
    assert.equal((await request(app).get('/api/auth/me').set(bearer(wrongSignature))).status, 401);
  });

  test('deleted users cannot continue using otherwise valid tokens', async () => {
    const passwordHash = await bcrypt.hash('TemporaryPassword!', 10);
    await prisma.user.create({
      data: {
        id: TEMP.deletedUser,
        localId: IDS.local27,
        email: 'deleted-user@example.test',
        passwordHash,
        role: 'MEMBER',
      },
    });
    const token = signFor({
      id: TEMP.deletedUser,
      localId: IDS.local27,
      role: 'MEMBER',
    });
    await prisma.user.delete({ where: { id: TEMP.deletedUser } });
    assert.equal((await request(app).get('/api/auth/me').set(bearer(token))).status, 401);
  });

  test('forged role and tenant claims cannot elevate current database identity', async () => {
    const account = accounts['member27@example.test'];
    const forgedRole = signFor(account, { role: 'LEADER' });
    const forgedTenant = signFor(account, { localId: IDS.local28 });
    assert.equal((await request(app).get('/api/members').set(bearer(forgedRole))).status, 403);
    const profile = await request(app).get('/api/members/me').set(bearer(forgedTenant));
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.localId, IDS.local27);
  });

  test('unknown token roles are rejected', async () => {
    const account = accounts['leader27@example.test'];
    const token = jwt.sign(
      { localId: account.localId, role: 'ADMIN' },
      JWT_SECRET,
      { ...JWT_OPTIONS, expiresIn: '1h', subject: account.id },
    );
    assert.equal((await request(app).get('/api/auth/me').set(bearer(token))).status, 401);
  });
});

describe('role and member ownership authorization', () => {
  test('member cannot use leader-only member and announcement lists', async () => {
    assert.equal((await request(app).get('/api/members').set(bearer(member27Token))).status, 403);
    assert.equal(
      (await request(app).get('/api/announcements').set(bearer(member27Token))).status,
      403,
    );
  });

  test('leader cannot use member-only profile endpoint', async () => {
    assert.equal((await request(app).get('/api/members/me').set(bearer(leader27Token))).status, 403);
  });

  test('member account without a linked profile receives no member data', async () => {
    const token = signFor({ id: TEMP.unlinkedUser, localId: IDS.local27, role: 'MEMBER' });
    const response = await request(app).get('/api/members/me').set(bearer(token));
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { success: false, message: 'Resource not found' });
  });

  test('member profile ignores client-supplied member and local identifiers', async () => {
    const response = await request(app)
      .get(`/api/members/me?memberId=${IDS.local28CrossTenantMember}&localId=${IDS.local28}`)
      .set(bearer(member27Token));
    assert.equal(response.status, 200);
    assert.equal(response.body.data.localId, IDS.local27);
    assert.notEqual(response.body.data.id, IDS.local28CrossTenantMember);
    assert.equal(response.body.data.email, 'member27@example.test');
  });

  test('member can read an addressed announcement but not an unassigned one', async () => {
    const addressed = await request(app)
      .get(`/api/member/announcements/${IDS.sentAnnouncement}`)
      .set(bearer(member27Token));
    const unassigned = await request(app)
      .get(`/api/member/announcements/${TEMP.local27UnassignedAnnouncement}`)
      .set(bearer(member27Token));
    assert.equal(addressed.status, 200);
    assert.equal(addressed.body.data.id, IDS.sentAnnouncement);
    assert.equal(unassigned.status, 404);
  });

  test('member cannot read a cross-local announcement', async () => {
    const response = await request(app)
      .get(`/api/member/announcements/${IDS.sentAnnouncement}`)
      .set(bearer(member28Token));
    assert.equal(response.status, 404);
    assert.equal(response.body.message, 'Resource not found');
  });
});

describe('tenant isolation', () => {
  test('leader member list is always scoped to the authenticated local', async () => {
    const response = await request(app)
      .get(`/api/members?localId=${IDS.local28}&limit=100`)
      .set(bearer(leader27Token));
    assert.equal(response.status, 200);
    assert.ok(response.body.data.length > 0);
    assert.ok(response.body.data.every((member) => member.localId === IDS.local27));
    assert.equal(response.body.pagination.total, 2000);
  });

  test('classification filtering remains inside tenant scope', async () => {
    const response = await request(app)
      .get('/api/members?classification=Transit%20Operator&limit=100')
      .set(bearer(leader28Token));
    assert.equal(response.status, 200);
    assert.equal(response.body.pagination.total, 50);
    assert.ok(response.body.data.every((member) => member.localId === IDS.local28));
  });

  test('leaders receive 404 for announcements in another local', async () => {
    const local27To28 = await request(app)
      .get(`/api/announcements/${TEMP.local28Announcement}`)
      .set(bearer(leader27Token));
    const local28To27 = await request(app)
      .get(`/api/announcements/${IDS.sentAnnouncement}`)
      .set(bearer(leader28Token));
    assert.equal(local27To28.status, 404);
    assert.equal(local28To27.status, 404);
    assert.equal(local27To28.body.message, 'Resource not found');
  });

  test('leader announcement lists contain only their tenant', async () => {
    const response = await request(app)
      .get(`/api/announcements?localId=${IDS.local28}`)
      .set(bearer(leader27Token));
    assert.equal(response.status, 200);
    assert.ok(response.body.data.every((announcement) => announcement.localId === IDS.local27));
  });
});

describe('fail-closed routing and errors', () => {
  test('protected routes inherit parent authentication', async () => {
    assert.equal((await request(app).get('/api/announcements')).status, 401);
    assert.equal((await request(app).get('/api/future-protected-route')).status, 401);
    assert.equal(
      (await request(app).get('/api/future-protected-route').set(bearer(leader27Token))).status,
      404,
    );
  });

  test('invalid UUIDs produce controlled validation errors', async () => {
    const response = await request(app)
      .get('/api/announcements/not-a-uuid')
      .set(bearer(leader27Token));
    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Validation failed');
    assert.ok(Array.isArray(response.body.errors));
  });

  test('validation responses never echo submitted passwords', async () => {
    const password = 'secret-that-must-not-be-returned'.repeat(3);
    const response = await login('not-an-email', password);
    assert.equal(response.status, 400);
    assert.equal(JSON.stringify(response.body).includes(password), false);
  });

  test('internal errors do not expose stack traces, credentials, or tokens', () => {
    let body;
    const res = {
      statusCode: 0,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(value) {
        body = value;
      },
    };
    errorHandler(new Error('postgresql://secret-password token-value'), {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(body, { success: false, message: 'Internal server error' });
    assert.equal('stack' in body, false);
  });
});

describe('stateless multi-client compatibility', () => {
  test('a token issued through one client is accepted through another', async () => {
    const firstClient = request(app);
    const secondClient = request(app);
    const loginResponse = await firstClient
      .post('/api/auth/login')
      .send({ email: 'leader27@example.test', password: 'CrewLink27Leader!' });
    const meResponse = await secondClient
      .get('/api/auth/me')
      .set(bearer(loginResponse.body.data.token));
    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.data.id, IDS.local27Leader);
  });

  test('role enforcement is identical across independent clients', async () => {
    const responses = await Promise.all([
      request(app).get('/api/members').set(bearer(member27Token)),
      request(app).get('/api/members').set(bearer(member27Token)),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [403, 403]);
  });
});
