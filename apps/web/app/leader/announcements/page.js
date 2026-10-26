'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { EmptyState, ErrorState, LoadingState, Pagination, StatusBadge, formatDate } from '../../../components/UI';

export default function AnnouncementsPage() {
  const [page, setPage] = useState(1); const [state, setState] = useState({ loading: true });
  const load = useCallback(async (signal) => { setState({ loading: true }); try { const result = await apiRequest(`/api/announcements?page=${page}&limit=20`, { signal }); setState({ items: result.data, pagination: result.pagination }); } catch (error) { if (error.name !== 'AbortError') setState({ error: error.message }); } }, [page]);
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, [load]);
  return <><div className="page-heading"><div><p className="eyebrow">Communications</p><h2>Announcements</h2><p>Create, approve, send, and review your local's callouts.</p></div><Link className="button" href="/leader/announcements/new">Create announcement</Link></div>{state.loading ? <LoadingState /> : state.error ? <ErrorState message={state.error} retry={() => load()} /> : state.items.length === 0 ? <EmptyState title="No announcements" message="Start with a draft and invite deliberate review before sending." action={<Link className="button small" href="/leader/announcements/new">Create draft</Link>} /> : <><div className="card table-card"><table><thead><tr><th>Announcement</th><th>Status</th><th>Created</th><th>Approved</th><th>Sent</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{state.items.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.classificationFilter ? `Target: ${item.classificationFilter}` : 'All active members'}</small></td><td><StatusBadge status={item.status} /></td><td>{formatDate(item.createdAt)}</td><td>{formatDate(item.approvedAt)}</td><td>{formatDate(item.sentAt)}</td><td><Link href={`/leader/announcements/${item.id}`}>View</Link></td></tr>)}</tbody></table></div><Pagination pagination={state.pagination} onPage={setPage} /></>}</>;
}
