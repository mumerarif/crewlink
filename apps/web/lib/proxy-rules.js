const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

const RULES = [
  ['GET', /^\/api\/members(?:\?.*)?$/],
  ['GET', /^\/api\/members\/me(?:\?.*)?$/],
  ['GET', /^\/api\/announcements(?:\?.*)?$/],
  ['POST', /^\/api\/announcements$/],
  ['GET', new RegExp(`^/api/announcements/${UUID}$`)],
  ['PATCH', new RegExp(`^/api/announcements/${UUID}$`)],
  ['POST', new RegExp(`^/api/announcements/${UUID}/(?:submit|approve|send)$`)],
  ['GET', new RegExp(`^/api/announcements/${UUID}/(?:status|engagement)$`)],
  ['POST', /^\/api\/ai\/draft$/],
  ['GET', /^\/api\/member\/announcements(?:\?.*)?$/],
  ['GET', new RegExp(`^/api/member/announcements/${UUID}$`)],
  ['POST', new RegExp(`^/api/member/announcements/${UUID}/(?:read|acknowledge)$`)],
  ['PUT', new RegExp(`^/api/member/announcements/${UUID}/rsvp$`)],
];

export function isAllowedBackendRequest(method, pathWithQuery) {
  return RULES.some(([allowedMethod, pattern]) => (
    method === allowedMethod && pattern.test(pathWithQuery)
  ));
}

export function normalizeBackendPath(segments) {
  const joined = segments.join('/');
  return joined.startsWith('api/') ? `/${joined}` : `/api/${joined}`;
}
