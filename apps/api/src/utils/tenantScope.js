const AppError = require('./AppError');

function requireIdentity(identity) {
  if (!identity || !identity.id || !identity.localId || !identity.role) {
    throw new AppError('Authentication required', 401);
  }
  return identity;
}

function tenantWhere(identity, where = {}) {
  const authenticated = requireIdentity(identity);
  return { ...where, localId: authenticated.localId };
}

module.exports = { requireIdentity, tenantWhere };
