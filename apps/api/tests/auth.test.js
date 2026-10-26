const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://crewlink:crewlink@localhost:5432/crewlink';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= 'crewlink-unit-test-secret-at-least-32-characters';
process.env.JWT_EXPIRES_IN ||= '1h';

const request = require('supertest');
const app = require('../src/app');

test('health endpoint reports API identity', async () => {
  const response = await request(app).get('/health').expect(200);

  assert.deepEqual(response.body, {
    status: 'ok',
    service: 'crewlink-api',
    instance: process.env.INSTANCE_ID || 'api-1',
  });
});

test('login validation fails without echoing credential values', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'bad', password: 'do-not-echo' })
    .expect(400);
  assert.equal(response.body.success, false);
  assert.equal(JSON.stringify(response.body).includes('do-not-echo'), false);
});

test('protected routes fail closed at the parent router', async () => {
  const response = await request(app).get('/api/future-route').expect(401);
  assert.deepEqual(response.body, { success: false, message: 'Authentication required' });
});
