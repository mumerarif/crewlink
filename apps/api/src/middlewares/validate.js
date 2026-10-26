const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

function validate(req, _res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const safeErrors = errors.array().map(({ value: _value, ...error }) => error);
    return next(new AppError('Validation failed', 400, safeErrors));
  }

  return next();
}

module.exports = validate;
