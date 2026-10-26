const AppError = require('../utils/AppError');

const KNOWN_ROLES = new Set(['LEADER', 'MEMBER']);

function authorizeRole(...allowedRoles) {
  const configuredRoles = new Set(allowedRoles.filter((role) => KNOWN_ROLES.has(role)));

  return function enforceRole(req, _res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!KNOWN_ROLES.has(req.user.role) || !configuredRoles.has(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    return next();
  };
}

module.exports = authorizeRole;
