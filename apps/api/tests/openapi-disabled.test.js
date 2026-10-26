const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'production';
process.env.DATABASE_URL ||= 'postgresql://crewlink:crewlink@localhost:5432/crewlink';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= 'crewlink-unit-test-secret-at-least-32-characters';
process.env.JWT_EXPIRES_IN ||= '1h';
process.env.API_DOCS_ENABLED = 'false';

const request = require('supertest');
const app = require('../src/app');

test('documentation routes remain behind fail-closed authentication when disabled', async () => {
  const response = await request(app).get('/api/openapi.json').expect(401);
  assert.deepEqual(response.body, { success: false, message: 'Authentication required' });
});
