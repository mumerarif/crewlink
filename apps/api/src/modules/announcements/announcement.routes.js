const express = require('express');
const authorizeRole = require('../../middlewares/authorizeRole');
const validate = require('../../middlewares/validate');
const controller = require('./announcement.controller');
const {
  announcementIdValidation,
  announcementListValidation,
  createAnnouncementValidation,
  updateAnnouncementValidation,
  memberInboxValidation,
  rsvpValidation,
} = require('./announcement.validation');

const leaderAnnouncementRouter = express.Router();
const memberAnnouncementRouter = express.Router();

leaderAnnouncementRouter.post(
  '/',
  authorizeRole('LEADER'),
  createAnnouncementValidation,
  validate,
  controller.create,
);

leaderAnnouncementRouter.get(
  '/:id/engagement',
  authorizeRole('LEADER'),
  announcementIdValidation,
  validate,
  controller.engagement,
);
leaderAnnouncementRouter.get(
  '/',
  authorizeRole('LEADER'),
  announcementListValidation,
  validate,
  controller.list,
);
leaderAnnouncementRouter.get(
  '/:id/status',
  authorizeRole('LEADER'),
  announcementIdValidation,
  validate,
  controller.status,
);
leaderAnnouncementRouter.patch(
  '/:id',
  authorizeRole('LEADER'),
  updateAnnouncementValidation,
  validate,
  controller.update,
);
leaderAnnouncementRouter.post(
  '/:id/submit',
  authorizeRole('LEADER'),
  announcementIdValidation,
  validate,
  controller.submit,
);
leaderAnnouncementRouter.post(
  '/:id/approve',
  authorizeRole('LEADER'),
  announcementIdValidation,
  validate,
  controller.approve,
);
leaderAnnouncementRouter.post(
  '/:id/send',
  authorizeRole('LEADER'),
  announcementIdValidation,
  validate,
  controller.send,
);
leaderAnnouncementRouter.get(
  '/:id',
  authorizeRole('LEADER'),
  announcementIdValidation,
  validate,
  controller.detail,
);
memberAnnouncementRouter.get(
  '/',
  authorizeRole('MEMBER'),
  memberInboxValidation,
  validate,
  controller.memberInbox,
);
memberAnnouncementRouter.post(
  '/:id/read',
  authorizeRole('MEMBER'),
  announcementIdValidation,
  validate,
  controller.markRead,
);
memberAnnouncementRouter.post(
  '/:id/acknowledge',
  authorizeRole('MEMBER'),
  announcementIdValidation,
  validate,
  controller.acknowledge,
);
memberAnnouncementRouter.put(
  '/:id/rsvp',
  authorizeRole('MEMBER'),
  rsvpValidation,
  validate,
  controller.rsvp,
);
memberAnnouncementRouter.get(
  '/:id',
  authorizeRole('MEMBER'),
  announcementIdValidation,
  validate,
  controller.memberDetail,
);

module.exports = { leaderAnnouncementRouter, memberAnnouncementRouter };
