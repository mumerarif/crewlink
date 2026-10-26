const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });
  res.json({ success: true, data: result });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user);
  res.json({ success: true, data: user });
});

module.exports = { login, me };
