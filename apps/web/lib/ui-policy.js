export function leaderActionsForStatus(status) {
  if (status === 'DRAFT') return ['edit', 'submit'];
  if (status === 'PENDING_APPROVAL') return ['approve'];
  if (status === 'APPROVED') return ['send'];
  return [];
}

export function shouldRecordRead(announcement, alreadyRequested) {
  return Boolean(announcement && !announcement.recipient?.readAt && !alreadyRequested);
}

export function rsvpPayload(response) {
  if (!['YES', 'NO', 'MAYBE'].includes(response)) throw new Error('Invalid RSVP response');
  return { response };
}

export function buildInboxPath({ limit = 12, cursor, read, acknowledgment } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  if (read) query.set('read', read);
  if (acknowledgment) query.set('acknowledgment', acknowledgment);
  return `/api/member/announcements?${query}`;
}

export function engagementViewState(enabled, state) {
  if (!enabled) return 'disabled';
  if (state.error) return 'error';
  if (state.loading || !state.data) return 'loading';
  return 'ready';
}
