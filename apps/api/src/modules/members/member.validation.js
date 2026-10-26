const { query } = require('express-validator');

const memberListValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('classification')
    .optional()
    .isString()
    .withMessage('Classification must be text')
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Classification must be between 1 and 100 characters'),
];

module.exports = { memberListValidation };
