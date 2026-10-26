const { body, param, query } = require('express-validator');

const announcementIdValidation = [
  param('id').isUUID().withMessage('Announcement ID must be a valid UUID'),
];

const announcementListValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

const editableFields = [
  body('title').optional().isString().trim().isLength({ min: 1, max: 250 }),
  body('body').optional().isString().trim().isLength({ min: 1, max: 10000 }),
  body('pushPreview')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 120 }),
  body('needsAck').optional().isBoolean(),
  body('rsvpEnabled').optional().isBoolean(),
  body('classificationFilter')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 }),
];

const createAnnouncementValidation = [
  body('title').isString().trim().isLength({ min: 1, max: 250 }),
  body('body').isString().trim().isLength({ min: 1, max: 10000 }),
  ...editableFields.slice(2),
];

const updateAnnouncementValidation = [
  ...announcementIdValidation,
  ...editableFields,
  body().custom((value) => {
    const fields = [
      'title', 'body', 'pushPreview', 'needsAck', 'rsvpEnabled', 'classificationFilter',
    ];
    if (!fields.some((field) => Object.hasOwn(value, field))) {
      throw new Error('At least one editable field is required');
    }
    return true;
  }),
];

const memberInboxValidation = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('cursor').optional().isString().isLength({ min: 1, max: 500 }),
  query('read').optional().isIn(['read', 'unread']),
  query('acknowledgment').optional().isIn(['acknowledged', 'unacknowledged']),
];

const rsvpValidation = [
  ...announcementIdValidation,
  body('response').isIn(['YES', 'NO', 'MAYBE']).withMessage('Response must be YES, NO, or MAYBE'),
];

module.exports = {
  announcementIdValidation,
  announcementListValidation,
  createAnnouncementValidation,
  updateAnnouncementValidation,
  memberInboxValidation,
  rsvpValidation,
};
