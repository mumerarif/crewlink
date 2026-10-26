function paginationFromQuery(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 25);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

module.exports = { paginationFromQuery };
