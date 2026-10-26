'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { EmptyState, ErrorState, LoadingState, MetricCard, StatusBadge, formatDate } from '../../components/UI';

export default function LeaderDashboard() {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(async (signal) => {
    setState({ loading: true });
    try {
      const [members, announcements] = await Promise.all([apiRequest('/api/members?page=1&limit=1', { signal }), apiRequest('/api/announcements?page=1&limit=8', { signal })]);
      setState({ members: members.pagination, announcements: announcements.data });
    } catch (error) { if (error.name !== 'AbortError') setState({ error: error.message }); }
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  if (state.loading) return <LoadingState label="Loading local overview…" />;
  if (state.error) return <ErrorState message={state.error} retry={() => load()} />;
  const attention = state.announcements.filter((a) => ['DRAFT', 'PENDING_APPROVAL'].includes(a.status)).length;
  const active = state.announcements.filter((a) => a.status === 'SENDING').length;
  return <><div className="page-heading"><div><p className="eyebrow">Operational overview</p><h2>Your local at a glance</h2><p>Recent communication activity and quick actions.</p></div><Link className="button" href="/leader/announcements/new">Create announcement</Link></div><section className="metric-grid"><MetricCard label="Members" value={state.members.total} detail="Current local" /><MetricCard label="Needs attention" value={attention} detail="Among recent announcements" /><MetricCard label="Active sends" value={active} detail="Among recent announcements" /></section><section className="card"><div className="section-heading"><div><h3>Recent announcements</h3><p>Latest activity in your local.</p></div><Link href="/leader/announcements">View all</Link></div>{state.announcements.length ? <div className="stack-list">{state.announcements.map((item) => <Link className="list-row" key={item.id} href={`/leader/announcements/${item.id}`}><span><strong>{item.title}</strong><small>{formatDate(item.createdAt)}</small></span><StatusBadge status={item.status} /></Link>)}</div> : <EmptyState title="No announcements yet" message="Create the first callout for your local." />}</section></>;
}
