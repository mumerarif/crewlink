'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { ErrorState, LoadingState, StatusBadge, formatDate } from '../../../components/UI';

export default function ProfilePage() {
  const [state, setState] = useState({ loading: true }); const load = useCallback(async (signal) => { setState({ loading: true }); try { const result = await apiRequest('/api/members/me', { signal }); setState({ data: result.data }); } catch (e) { if (e.name !== 'AbortError') setState({ error: e.message }); } }, []);
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, [load]);
  if (state.loading) return <LoadingState label="Loading profile…" />; if (state.error) return <ErrorState message={state.error} retry={() => load()} />; const m = state.data;
  return <><div className="page-heading"><div><p className="eyebrow">Member record</p><h2>My profile</h2><p>This information is read-only and scoped to your authenticated account.</p></div></div><section className="card profile-card"><div className="avatar" aria-hidden="true">{m.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}</div><div><h3>{m.fullName}</h3><p>{m.email}</p></div><StatusBadge status={m.status} /><dl><div><dt>Classification</dt><dd>{m.classification}</dd></div><div><dt>Member since</dt><dd>{formatDate(m.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{formatDate(m.updatedAt)}</dd></div></dl></section></>;
}
