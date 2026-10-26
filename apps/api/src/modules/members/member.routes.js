const express = require('express');
const authorizeRole = require('../../middlewares/authorizeRole');
const validate = require('../../middlewares/validate');
const controller = require('./member.controller');
const { memberListValidation } = require('./member.validation');

const router = express.Router();

router.get('/me', authorizeRole('MEMBER'), controller.me);
router.get('/', authorizeRole('LEADER'), memberListValidation, validate, controller.list);

module.exports = router;
