'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { engagementViewState } from '../lib/ui-policy';
import { ErrorState, LoadingState, MetricCard } from './UI';

function Bar({ label, value, total }) {
  const percentage = total ? Math.round((value / total) * 100) : 0;
  return <div className="progress-row"><div><span>{label}</span><strong>{value} <small>({percentage}%)</small></strong></div><progress max={total || 1} value={value}>{percentage}%</progress></div>;
}

export default function EngagementPanel({ announcementId, enabled }) {
  const [state, setState] = useState({ loading: enabled });
  const load = useCallback(async (signal) => { if (!enabled) return; setState({ loading: true }); try { const result = await apiRequest(`/api/announcements/${announcementId}/engagement`, { signal }); setState({ data: result.data }); } catch (e) { if (e.name !== 'AbortError') setState({ error: e.message }); } }, [announcementId, enabled]);
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, [load]);
  const view = engagementViewState(enabled, state);
  if (view === 'disabled') return <div className="subtle-panel">Engagement becomes available after the send begins.</div>;
  if (view === 'loading') return <LoadingState label="Loading engagement…" />;
  if (view === 'error') return <ErrorState message={state.error} retry={() => load()} />;
  const d = state.data; return <><div className="section-heading"><div><h3>Engagement report</h3><p>Persisted simulated delivery and member responses.</p></div><button className="button ghost small" onClick={() => load()}>Refresh</button></div><div className="metric-grid four"><MetricCard label="Recipients" value={d.totalRecipients} /><MetricCard label="Delivered" value={d.delivery.completed} /><MetricCard label="Read" value={d.reads.read} /><MetricCard label="Unread" value={d.reads.unread} /></div><div className="report-grid"><section><h4>Simulated delivery</h4><Bar label="Completed" value={d.delivery.completed} total={d.totalRecipients} /><Bar label="Pending" value={d.delivery.pending} total={d.totalRecipients} /><Bar label="Failed" value={d.delivery.failed} total={d.totalRecipients} /></section><section><h4>Human engagement</h4><Bar label="Read" value={d.reads.read} total={d.totalRecipients} />{d.acknowledgments.required ? <><Bar label="Acknowledged" value={d.acknowledgments.acknowledged} total={d.totalRecipients} /><Bar label="Outstanding" value={d.acknowledgments.outstanding} total={d.totalRecipients} /></> : <p className="muted">Acknowledgment was not required.</p>}{d.rsvp.enabled ? <><Bar label="RSVP yes" value={d.rsvp.yes} total={d.totalRecipients} /><Bar label="RSVP no" value={d.rsvp.no} total={d.totalRecipients} /><Bar label="RSVP maybe" value={d.rsvp.maybe} total={d.totalRecipients} /><Bar label="No response" value={d.rsvp.noResponse} total={d.totalRecipients} /></> : <p className="muted">RSVP was not enabled.</p>}</section></div></>;
}
