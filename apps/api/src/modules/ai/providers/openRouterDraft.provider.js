const AppError = require('../../../utils/AppError');

const SYSTEM_PROMPT = [
  'You draft professional announcements for union local leadership.',
  'Preserve every supplied fact and do not invent dates, obligations, policies, or event details.',
  'Return only JSON with string fields "subject" and "body".',
  'The output is an untrusted draft and always requires human review and approval.',
].join(' ');

function providerError(message = 'OpenRouter draft generation failed', statusCode = 502) {
  return new AppError(message, statusCode);
}

function createOpenRouterDraftProvider({ config, fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  return {
    async generate(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.openRouterTimeoutMs);
      try {
        const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.openRouterModel,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: JSON.stringify(input) },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw providerError();
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw providerError('OpenRouter returned an invalid response');
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw providerError('OpenRouter returned an invalid response');
        }
        if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
          throw providerError('OpenRouter returned an invalid response');
        }
        return {
          subject: parsed.subject.trim(),
          body: parsed.body.trim(),
          provider: 'openrouter',
          model: config.openRouterModel,
        };
      } catch (error) {
        if (error.name === 'AbortError') throw providerError('OpenRouter request timed out', 504);
        if (error instanceof AppError) throw error;
        throw providerError();
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

module.exports = { createOpenRouterDraftProvider };
