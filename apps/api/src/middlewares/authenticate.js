const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_ROLES = new Set(['LEADER', 'MEMBER']);

function authenticationError() {
  return new AppError('Authentication required', 401);
}

async function authenticate(req, _res, next) {
  const authorization = req.get('authorization');
  const match = authorization && authorization.match(/^Bearer ([^\s]+)$/);

  if (!match) {
    return next(authenticationError());
  }

  let payload;
  try {
    payload = jwt.verify(match[1], env.jwtSecret, {
      algorithms: [env.jwtAlgorithm],
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    });
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.NotBeforeError
    ) {
      return next(authenticationError());
    }
    return next(error);
  }

  if (
    typeof payload !== 'object' ||
    !UUID_PATTERN.test(payload.sub || '') ||
    !UUID_PATTERN.test(payload.localId || '') ||
    !TOKEN_ROLES.has(payload.role)
  ) {
    return next(authenticationError());
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, localId: true, role: true },
    });

    if (!user || !TOKEN_ROLES.has(user.role)) {
      return next(authenticationError());
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticate;
