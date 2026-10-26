const asyncHandler = require('../../utils/asyncHandler');
const announcementService = require('./announcement.service');

const list = asyncHandler(async (req, res) => {
  const result = await announcementService.listAnnouncements(req.user, req.query);
  res.json({ success: true, data: result.announcements, pagination: result.pagination });
});

const detail = asyncHandler(async (req, res) => {
  const announcement = await announcementService.getAnnouncementForLeader(req.user, req.params.id);
  res.json({ success: true, data: announcement });
});

const memberDetail = asyncHandler(async (req, res) => {
  const announcement = await announcementService.getAnnouncementForMember(
    req.user,
    req.params.id,
  );
  res.json({ success: true, data: announcement });
});

const memberInbox = asyncHandler(async (req, res) => {
  const result = await announcementService.listAnnouncementsForMember(req.user, req.query);
  res.json({ success: true, data: result });
});

const markRead = asyncHandler(async (req, res) => {
  const state = await announcementService.markAnnouncementRead(req.user, req.params.id);
  res.json({ success: true, data: state });
});

const acknowledge = asyncHandler(async (req, res) => {
  const state = await announcementService.acknowledgeAnnouncement(req.user, req.params.id);
  res.json({ success: true, data: state });
});

const rsvp = asyncHandler(async (req, res) => {
  const state = await announcementService.updateRsvp(req.user, req.params.id, req.body.response);
  res.json({ success: true, data: state });
});

const create = asyncHandler(async (req, res) => {
  const announcement = await announcementService.createAnnouncement(req.user, req.body);
  res.status(201).json({ success: true, data: announcement });
});

const update = asyncHandler(async (req, res) => {
  const announcement = await announcementService.updateAnnouncement(
    req.user,
    req.params.id,
    req.body,
  );
  res.json({ success: true, data: announcement });
});

const submit = asyncHandler(async (req, res) => {
  const announcement = await announcementService.submitAnnouncement(req.user, req.params.id);
  res.json({ success: true, data: announcement });
});

const approve = asyncHandler(async (req, res) => {
  const announcement = await announcementService.approveAnnouncement(req.user, req.params.id);
  res.json({ success: true, data: announcement });
});

const send = asyncHandler(async (req, res) => {
  const result = await announcementService.sendAnnouncement(req.user, req.params.id);
  const statusCode = ['SENT', 'FAILED'].includes(result.status) ? 200 : 202;
  res.status(statusCode).json({ success: true, data: result });
});

const status = asyncHandler(async (req, res) => {
  const result = await announcementService.getSendStatus(req.user, req.params.id);
  res.json({ success: true, data: result });
});

const engagement = asyncHandler(async (req, res) => {
  const result = await announcementService.getEngagement(req.user, req.params.id);
  res.json({ success: true, data: result });
});

module.exports = {
  list,
  detail,
  memberInbox,
  memberDetail,
  markRead,
  acknowledge,
  rsvp,
  create,
  update,
  submit,
  approve,
  send,
  status,
  engagement,
};
