const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://crewlink:crewlink@localhost:5432/crewlink';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= 'crewlink-unit-test-secret-at-least-32-characters';
process.env.JWT_EXPIRES_IN ||= '1h';

const { createAiService } = require('../src/modules/ai/ai.service');

const input = {
  topic: 'Upcoming Membership Meeting',
  keyPoints: ['Meeting will take place on November 12', 'Review the agenda'],
  tone: 'professional',
};

function config(overrides = {}) {
  return {
    aiDraftMode: 'mock',
    openRouterApiKey: '',
    openRouterModel: 'openai/gpt-4o-mini',
    openRouterTimeoutMs: 20,
    ...overrides,
  };
}

test('mock AI is deterministic, offline, and does not require a key', async () => {
  let calls = 0;
  const service = createAiService({ config: config(), fetchImpl: async () => { calls += 1; } });
  const first = await service.generateDraft(input);
  const second = await service.generateDraft(input);
  assert.deepEqual(first, second);
  assert.equal(first.provider, 'mock');
  assert.equal(first.model, 'preset-template');
  assert.equal(first.requiresHumanApproval, true);
  assert.equal(calls, 0);
});

test('mock AI never calls OpenRouter even when a key is present', async () => {
  let calls = 0;
  const service = createAiService({
    config: config({ openRouterApiKey: 'present-but-unused' }),
    fetchImpl: async () => { calls += 1; },
  });
  await service.generateDraft(input);
  assert.equal(calls, 0);
});

test('OpenRouter uses the configured endpoint, authorization, model, and normalized output', async () => {
  let request;
  const service = createAiService({
    config: config({ aiDraftMode: 'openrouter', openRouterApiKey: 'test-key' }),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: '{"subject":"Subject","body":"Body"}' } }] };
        },
      };
    },
  });
  const result = await service.generateDraft({
    ...input,
    model: 'client-controlled-model',
    apiKey: 'client-controlled-key',
  });
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(request.options.body).model, 'openai/gpt-4o-mini');
  const providerInput = JSON.parse(JSON.parse(request.options.body).messages[1].content);
  assert.equal('model' in providerInput, false);
  assert.equal('apiKey' in providerInput, false);
  assert.deepEqual(result, {
    subject: 'Subject', body: 'Body', provider: 'openrouter',
    model: 'openai/gpt-4o-mini', requiresHumanApproval: true,
  });
});

test('OpenRouter malformed responses and transport failures are controlled', async () => {
  const malformed = createAiService({
    config: config({ aiDraftMode: 'openrouter', openRouterApiKey: 'test-key' }),
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }),
  });
  await assert.rejects(malformed.generateDraft(input), (error) => error.statusCode === 502);

  const failed = createAiService({
    config: config({ aiDraftMode: 'openrouter', openRouterApiKey: 'test-key' }),
    fetchImpl: async () => { throw new Error('secret transport detail'); },
  });
  await assert.rejects(failed.generateDraft(input), (error) => {
    assert.equal(error.statusCode, 502);
    assert.equal(error.message.includes('secret'), false);
    return true;
  });
});

test('OpenRouter timeouts are reported safely', async () => {
  const service = createAiService({
    config: config({ aiDraftMode: 'openrouter', openRouterApiKey: 'test-key', openRouterTimeoutMs: 1 }),
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  await assert.rejects(service.generateDraft(input), (error) => error.statusCode === 504);
});

test('OpenRouter mode rejects missing configuration', () => {
  assert.throws(
    () => createAiService({ config: config({ aiDraftMode: 'openrouter' }) }),
    /OPENROUTER_API_KEY/,
  );
});
