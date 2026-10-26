'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import EngagementPanel from '../../../../components/EngagementPanel';
import { apiRequest, shouldPollStatus } from '../../../../lib/api';
import { ConfirmDialog, ErrorState, LoadingState, Notice, StatusBadge, formatDate } from '../../../../components/UI';

export default function AnnouncementDetailPage() {
  const { id } = useParams(); const [state, setState] = useState({ loading: true }); const [status, setStatus] = useState(null); const [action, setAction] = useState(''); const [dialog, setDialog] = useState(''); const [notice, setNotice] = useState(null);
  const load = useCallback(async (signal) => {
    setState((old) => ({ ...old, loading: true }));
    try {
      const result = await apiRequest(`/api/announcements/${id}`, { signal });
      setState({ data: result.data, loading: false });
      if (['SENDING', 'SENT', 'FAILED'].includes(result.data.status)) {
        try {
          const progress = await apiRequest(`/api/announcements/${id}/status`, { signal });
          setStatus(progress.data);
        } catch (error) {
          if (error.name !== 'AbortError') setNotice({ type: 'error', text: `Announcement loaded, but delivery progress could not refresh: ${error.message}` });
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setState((old) => old.data ? { ...old, loading: false } : { error: error.message, loading: false });
        setNotice({ type: 'error', text: `The latest announcement state could not refresh: ${error.message}` });
      }
    }
  }, [id]);
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, [load]);
  useEffect(() => { if (!shouldPollStatus(status?.status)) return undefined; const c = new AbortController(); const interval = setInterval(async () => { try { const result = await apiRequest(`/api/announcements/${id}/status`, { signal: c.signal }); setStatus(result.data); if (!shouldPollStatus(result.data.status)) { clearInterval(interval); setState((old) => ({ ...old, data: { ...old.data, status: result.data.status, sentAt: result.data.sentAt } })); } } catch (e) { if (e.name !== 'AbortError') setNotice({ type: 'error', text: e.message }); } }, 3000); return () => { clearInterval(interval); c.abort(); }; }, [id, status?.status]);
  async function run(kind) {
    setAction(kind); setNotice(null);
    try {
      const result = await apiRequest(`/api/announcements/${id}/${kind}`, { method: 'POST' });
      setState((old) => ({
        data: kind === 'send' ? { ...old.data, status: result.data.status } : result.data,
        loading: false,
      }));
      setNotice({ type: 'success', text: kind === 'send' ? 'Send accepted. Delivery progress is now live.' : `Announcement ${kind === 'submit' ? 'submitted for approval' : 'approved'}.` });
      setDialog('');
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: error.status === 409 ? `The announcement changed before this action completed: ${error.message}` : error.message });
    } finally { setAction(''); }
  }
  if (state.loading && !state.data) return <LoadingState label="Loading announcement…" />;
  if (state.error) return <ErrorState message={state.error} retry={() => load()} />;
  const item = state.data; const liveStatus = status?.status || item.status;
  return <><div className="page-heading"><div><p className="eyebrow">Announcement detail</p><div className="title-with-badge"><h2>{item.title}</h2><StatusBadge status={liveStatus} /></div><p>{item.classificationFilter ? `Targeted to ${item.classificationFilter}` : 'Targeted to all active members'}</p></div><div className="action-row">{item.status === 'DRAFT' && <><Link className="button secondary" href={`/leader/announcements/${id}/edit`}>Edit draft</Link><button className="button" disabled={Boolean(action)} onClick={() => run('submit')}>Submit for approval</button></>}{item.status === 'PENDING_APPROVAL' && <button className="button" disabled={Boolean(action)} onClick={() => setDialog('approve')}>Approve</button>}{item.status === 'APPROVED' && <button className="button" disabled={Boolean(action)} onClick={() => setDialog('send')}>Send announcement</button>}</div></div>{notice && <Notice type={notice.type}>{notice.text}</Notice>}<div className="detail-grid"><article className="card announcement-copy"><div className="metadata"><span><strong>Created</strong>{formatDate(item.createdAt)}</span><span><strong>Approved</strong>{formatDate(item.approvedAt)}</span><span><strong>Sent</strong>{formatDate(status?.sentAt || item.sentAt)}</span></div>{item.pushPreview && <div className="subtle-panel"><strong>Push preview</strong><p>{item.pushPreview}</p></div>}<div className="body-copy">{item.body}</div></article><aside className="card settings-list"><h3>Delivery settings</h3><dl><div><dt>Audience</dt><dd>{item.classificationFilter || 'All active members'}</dd></div><div><dt>Acknowledgment</dt><dd>{item.needsAck ? 'Required' : 'Not required'}</dd></div><div><dt>RSVP</dt><dd>{item.rsvpEnabled ? 'Enabled' : 'Disabled'}</dd></div><div><dt>Snapshotted recipients</dt><dd>{item._count?.recipients || 'Not calculated yet'}</dd></div></dl></aside></div>{status && <section className="card"><div className="section-heading"><div><h3>Delivery progress</h3><p>Simulated notifications backed by the durable delivery outbox.</p></div><StatusBadge status={status.status} /></div><div className="metric-grid four"><div className="metric"><span>Total</span><strong>{status.totalRecipients ?? '—'}</strong></div><div className="metric"><span>Completed</span><strong>{status.completed ?? 0}</strong></div><div className="metric"><span>Pending</span><strong>{status.pending ?? 0}</strong></div><div className="metric"><span>Failed</span><strong>{status.failed ?? 0}</strong></div></div>{status.status === 'SENDING' && <Notice type="info">Delivery is in progress. This page polls persisted backend state every three seconds.</Notice>}</section>}<section className="card"><EngagementPanel announcementId={id} enabled={['SENDING', 'SENT', 'FAILED'].includes(liveStatus)} /></section><ConfirmDialog open={dialog === 'approve'} title="Approve this announcement?" confirmLabel="Approve announcement" busy={action === 'approve'} onClose={() => setDialog('')} onConfirm={() => run('approve')}><p>You are confirming that this content and audience are ready for sending. Approval does not send it automatically.</p></ConfirmDialog><ConfirmDialog open={dialog === 'send'} title="Send this announcement?" confirmLabel="Start simulated send" danger busy={action === 'send'} onClose={() => setDialog('')} onConfirm={() => run('send')}><p>The backend will snapshot the eligible audience and queue simulated notifications. That audience cannot be edited after sending begins.</p><p><strong>Target:</strong> {item.classificationFilter || 'All active members'}</p></ConfirmDialog></>;
}
