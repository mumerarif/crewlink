const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { paginationFromQuery } = require('../../utils/pagination');
const { tenantWhere } = require('../../utils/tenantScope');

const memberSelection = {
  id: true,
  localId: true,
  fullName: true,
  email: true,
  classification: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

async function getOwnProfile(identity) {
  const member = await prisma.member.findFirst({
    where: tenantWhere(identity, { userId: identity.id }),
    select: memberSelection,
  });

  if (!member) {
    throw new AppError('Resource not found', 404);
  }

  return member;
}

async function listMembers(identity, query) {
  const { page, limit, skip } = paginationFromQuery(query);
  const where = tenantWhere(identity, {
    ...(query.classification ? { classification: query.classification } : {}),
  });

  const [members, total] = await prisma.$transaction([
    prisma.member.findMany({
      where,
      select: memberSelection,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.member.count({ where }),
  ]);

  return {
    members,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

module.exports = { getOwnProfile, listMembers };
