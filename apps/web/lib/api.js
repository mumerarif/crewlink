export class ApiError extends Error {
  constructor(message, status = 500, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export async function apiRequest(path, options = {}) {
  if (!path.startsWith('/api/')) throw new Error('API path must start with /api/');
  const response = await fetch(`/api/backend${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({
    success: false,
    message: 'The service returned an unreadable response.',
  }));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/login?expired=1');
    }
    throw new ApiError(payload.message || 'Request failed', response.status, payload.errors || []);
  }
  return payload;
}

export function destinationForRole(role) {
  if (role === 'LEADER') return '/leader';
  if (role === 'MEMBER') return '/member';
  return '/login';
}

export function buildAnnouncementPayload(values) {
  return {
    title: values.title.trim(),
    body: values.body.trim(),
    pushPreview: values.pushPreview.trim() || null,
    needsAck: Boolean(values.needsAck),
    rsvpEnabled: Boolean(values.rsvpEnabled),
    classificationFilter: values.classificationFilter.trim() || null,
  };
}

export function shouldPollStatus(status) {
  return status === 'SENDING';
}
