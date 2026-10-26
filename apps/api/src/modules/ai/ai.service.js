const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { createMockDraftProvider } = require('./providers/mockDraft.provider');
const { createOpenRouterDraftProvider } = require('./providers/openRouterDraft.provider');

function validateAiConfiguration(config = env) {
  if (config.aiDraftMode === 'openrouter') {
    if (!config.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is required when AI_DRAFT_MODE=openrouter');
    }
    if (!config.openRouterModel) {
      throw new Error('OPENROUTER_MODEL is required when AI_DRAFT_MODE=openrouter');
    }
  }
}

function createAiService({ config = env, fetchImpl = globalThis.fetch } = {}) {
  validateAiConfiguration(config);
  const provider = config.aiDraftMode === 'mock'
    ? createMockDraftProvider()
    : createOpenRouterDraftProvider({ config, fetchImpl });

  return {
    async generateDraft(input) {
      const safeInput = {
        topic: input.topic,
        keyPoints: input.keyPoints,
        ...(input.tone ? { tone: input.tone } : {}),
        ...(input.additionalInstructions
          ? { additionalInstructions: input.additionalInstructions }
          : {}),
      };
      const draft = await provider.generate(safeInput);
      if (!draft || typeof draft.subject !== 'string' || typeof draft.body !== 'string') {
        throw new AppError('AI provider returned an invalid response', 502);
      }
      if (draft.subject.length < 1 || draft.subject.length > 250 || draft.body.length > 10000) {
        throw new AppError('AI provider returned an invalid response', 502);
      }
      return { ...draft, requiresHumanApproval: true };
    },
  };
}

const aiService = createAiService();
module.exports = { ...aiService, createAiService, validateAiConfiguration };
