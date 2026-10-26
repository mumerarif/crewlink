const { body } = require('express-validator');

const draftValidation = [
  body('topic').isString().trim().isLength({ min: 3, max: 200 }),
  body('keyPoints').isArray({ min: 1, max: 12 }),
  body('keyPoints.*').isString().trim().isLength({ min: 1, max: 500 }),
  body('tone').optional().isIn(['professional', 'concise', 'urgent', 'friendly','casual']),
  body('additionalInstructions').optional().isString().trim().isLength({ max: 1000 }),
];

module.exports = { draftValidation };
