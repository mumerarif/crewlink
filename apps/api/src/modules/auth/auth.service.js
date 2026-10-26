const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { tenantWhere } = require('../../utils/tenantScope');

const INVALID_CREDENTIALS = 'Invalid email or password';
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('crewlink-dummy-password', 10);

function signAccessToken(user) {
  return jwt.sign(
    { localId: user.localId, role: user.role },
    env.jwtSecret,
    {
      algorithm: env.jwtAlgorithm,
      expiresIn: env.jwtExpiresIn,
      subject: user.id,
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    },
  );
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, localId: true, email: true, passwordHash: true, role: true },
  });

  const passwordMatches = await bcrypt.compare(
    password,
    user ? user.passwordHash : DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AppError(INVALID_CREDENTIALS, 401);
  }

  return {
    token: signAccessToken(user),
    user: { id: user.id, localId: user.localId, role: user.role, email: user.email },
  };
}

async function getCurrentUser(identity) {
  const user = await prisma.user.findFirst({
    where: tenantWhere(identity, { id: identity.id }),
    select: { id: true, localId: true, role: true, email: true },
  });

  if (!user) {
    throw new AppError('Authentication required', 401);
  }

  return user;
}

module.exports = { login, getCurrentUser };
