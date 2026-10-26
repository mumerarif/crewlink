const asyncHandler = require('../../utils/asyncHandler');
const memberService = require('./member.service');

const me = asyncHandler(async (req, res) => {
  const member = await memberService.getOwnProfile(req.user);
  res.json({ success: true, data: member });
});

const list = asyncHandler(async (req, res) => {
  const result = await memberService.listMembers(req.user, req.query);
  res.json({ success: true, data: result.members, pagination: result.pagination });
});

module.exports = { me, list };
