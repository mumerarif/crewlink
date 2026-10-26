const express = require('express');
const { protectedAuthRouter } = require('./modules/auth/auth.routes');
const memberRouter = require('./modules/members/member.routes');
const {
  leaderAnnouncementRouter,
  memberAnnouncementRouter,
} = require('./modules/announcements/announcement.routes');
const aiRouter = require('./modules/ai/ai.routes');

const router = express.Router();

router.use('/auth', protectedAuthRouter);
router.use('/members', memberRouter);
router.use('/announcements', leaderAnnouncementRouter);
router.use('/member/announcements', memberAnnouncementRouter);
router.use('/ai', aiRouter);

module.exports = router;
