const express = require('express');
const authorizeRole = require('../../middlewares/authorizeRole');
const validate = require('../../middlewares/validate');
const controller = require('./ai.controller');
const { draftValidation } = require('./ai.validation');

const router = express.Router();
router.post('/draft', authorizeRole('LEADER'), draftValidation, validate, controller.draft);
module.exports = router;
