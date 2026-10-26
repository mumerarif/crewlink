const express = require('express');
const validate = require('../../middlewares/validate');
const controller = require('./auth.controller');
const { loginValidation } = require('./auth.validation');

const publicAuthRouter = express.Router();
const protectedAuthRouter = express.Router();

publicAuthRouter.post('/login', loginValidation, validate, controller.login);
protectedAuthRouter.get('/me', controller.me);

module.exports = { publicAuthRouter, protectedAuthRouter };
