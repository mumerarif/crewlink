const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://crewlink:crewlink@localhost:5432/crewlink';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= 'crewlink-unit-test-secret-at-least-32-characters';
process.env.JWT_EXPIRES_IN ||= '1h';
process.env.API_DOCS_ENABLED = 'true';

const SwaggerParser = require('@apidevtools/swagger-parser');
const request = require('supertest');
const document = require('../src/openapi/document');
const app = require('../src/app');
const { publicAuthRouter, protectedAuthRouter } = require('../src/modules/auth/auth.routes');
const memberRouter = require('../src/modules/members/member.routes');
const aiRouter = require('../src/modules/ai/ai.routes');
const {
  leaderAnnouncementRouter,
  memberAnnouncementRouter,
} = require('../src/modules/announcements/announcement.routes');

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

function routerOperations(router, basePath) {
  return router.stack.flatMap((layer) => {
    if (!layer.route) return [];
    return Object.keys(layer.route.methods)
      .filter((method) => layer.route.methods[method])
      .map((method) => {
        const path = `${basePath}${layer.route.path}`
          .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
          .replace(/\/$/, '');
        return `${method.toUpperCase()} ${path}`;
      });
  });
}

function implementedOperations() {
  return [
    'GET /health',
    ...routerOperations(publicAuthRouter, '/api/auth'),
    ...routerOperations(protectedAuthRouter, '/api/auth'),
    ...routerOperations(memberRouter, '/api/members'),
    ...routerOperations(aiRouter, '/api/ai'),
    ...routerOperations(leaderAnnouncementRouter, '/api/announcements'),
    ...routerOperations(memberAnnouncementRouter, '/api/member/announcements'),
  ].sort();
}

function documentedOperations() {
  return Object.entries(document.paths).flatMap(([path, pathItem]) => (
    Object.keys(pathItem)
      .filter((method) => HTTP_METHODS.has(method))
      .map((method) => `${method.toUpperCase()} ${path === '/health' ? path : `/api${path}`}`)
  )).sort();
}

test('OpenAPI document is valid OpenAPI 3.1', async () => {
  const validated = await SwaggerParser.validate(document);
  assert.equal(validated.openapi, '3.1.0');
});

test('OpenAPI operations exactly cover implemented functional routes', () => {
  assert.deepEqual(documentedOperations(), implementedOperations());
});

test('OpenAPI operation IDs are present and unique', () => {
  const operationIds = Object.values(document.paths).flatMap((pathItem) => (
    Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.has(method))
      .map(([, operation]) => operation.operationId)
  ));

  assert.equal(operationIds.every(Boolean), true);
  assert.equal(new Set(operationIds).size, operationIds.length);
});

test('documentation endpoints are deliberately public when enabled', async () => {
  const specification = await request(app).get('/api/openapi.json').expect(200);
  assert.equal(specification.body.openapi, '3.1.0');
  assert.equal(specification.headers['access-control-allow-origin'], process.env.CORS_ORIGIN || 'http://localhost:3000');

  const ui = await request(app).get('/api/docs/').expect(200);
  assert.match(ui.text, /CrewLink API Documentation/);
});

test('all protected operations declare Bearer security and a role', () => {
  const publicOperationIds = new Set(['getHealth', 'login']);

  for (const pathItem of Object.values(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || publicOperationIds.has(operation.operationId)) continue;
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      assert.ok(operation['x-required-role']);
    }
  }
});
