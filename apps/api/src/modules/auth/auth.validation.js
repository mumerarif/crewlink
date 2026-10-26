const { body } = require('express-validator');

const loginValidation = [
  body('email')
    .isString()
    .withMessage('Email is required')
    .bail()
    .trim()
    .isEmail()
    .withMessage('Email must be valid')
    .bail()
    .customSanitizer((email) => email.toLowerCase()),
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .notEmpty()
    .withMessage('Password is required')
    .bail()
    .custom((password) => Buffer.byteLength(password, 'utf8') <= 72)
    .withMessage('Password must not exceed 72 bytes'),
];

module.exports = { loginValidation };
