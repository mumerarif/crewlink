const asyncHandler = require('../../utils/asyncHandler');
const aiService = require('./ai.service');

const draft = asyncHandler(async (req, res) => {
  const result = await aiService.generateDraft(req.body);
  res.json({ success: true, data: result });
});

module.exports = { draft };
