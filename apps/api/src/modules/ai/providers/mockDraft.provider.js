function createMockDraftProvider() {
  return {
    async generate(input) {
      const topic = input.topic.trim();
      const points = input.keyPoints.map((point) => `- ${point.trim()}`).join('\n');
      const instructions = input.additionalInstructions
        ? `\n\nDrafting note for human review: ${input.additionalInstructions.trim()}`
        : '';
      return {
        subject: topic,
        body: `Hello Members,\n\nWe are sharing an important announcement regarding ${topic}.\n\n${points}${instructions}\n\nPlease review this information and follow any instructions provided by your local leadership.\n\nThank you,\nYour Local Leadership Team`,
        provider: 'mock',
        model: 'preset-template',
      };
    },
  };
}

module.exports = { createMockDraftProvider };
