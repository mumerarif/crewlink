'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiRequest, buildAnnouncementPayload } from '../lib/api';
import { ErrorState, LoadingState, Notice } from './UI';

const empty = { title: '', body: '', pushPreview: '', needsAck: false, rsvpEnabled: false, classificationFilter: '' };

export default function AnnouncementEditor({ announcementId }) {
  const router = useRouter();
  const [values, setValues] = useState(empty); const [loading, setLoading] = useState(Boolean(announcementId)); const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [aiOpen, setAiOpen] = useState(false); const [aiBusy, setAiBusy] = useState(false); const [aiError, setAiError] = useState(''); const [aiMeta, setAiMeta] = useState(null);
  useEffect(() => { if (!announcementId) return; const c = new AbortController(); apiRequest(`/api/announcements/${announcementId}`, { signal: c.signal }).then(({ data }) => { if (data.status !== 'DRAFT') throw new Error('Only draft announcements can be edited.'); setValues({ title: data.title, body: data.body, pushPreview: data.pushPreview || '', needsAck: data.needsAck, rsvpEnabled: data.rsvpEnabled, classificationFilter: data.classificationFilter || '' }); }).catch((e) => { if (e.name !== 'AbortError') setLoadError(e.message); }).finally(() => setLoading(false)); return () => c.abort(); }, [announcementId]);
  function change(event) { const { name, value, type, checked } = event.target; setValues((old) => ({ ...old, [name]: type === 'checkbox' ? checked : value })); }
  async function save(event) {
    event.preventDefault(); setError('');
    if (!values.title.trim() || !values.body.trim()) return setError('Title and message body are required.');
    setSaving(true);
    try { const result = await apiRequest(announcementId ? `/api/announcements/${announcementId}` : '/api/announcements', { method: announcementId ? 'PATCH' : 'POST', body: JSON.stringify(buildAnnouncementPayload(values)) }); router.push(`/leader/announcements/${result.data.id}`); router.refresh(); }
    catch (e) { setError(e.errors?.map((item) => item.msg).join(' ') || e.message); } finally { setSaving(false); }
  }
  async function generate(event) {
    event.preventDefault(); setAiError('');
    const data = new FormData(event.currentTarget); const topic = data.get('topic')?.trim(); const points = data.get('keyPoints')?.split('\n').map((p) => p.trim()).filter(Boolean);
    if (!topic || !points.length) return setAiError('Add a topic and at least one key point.');
    if ((values.title.trim() || values.body.trim()) && !window.confirm('Replace the current title and message with this AI draft? Unsaved wording will be overwritten.')) return;
    setAiBusy(true);
    try { const result = await apiRequest('/api/ai/draft', { method: 'POST', body: JSON.stringify({ topic, keyPoints: points, tone: data.get('tone'), ...(data.get('additionalInstructions')?.trim() ? { additionalInstructions: data.get('additionalInstructions').trim() } : {}) }) }); setValues((old) => ({ ...old, title: result.data.subject, body: result.data.body })); setAiMeta(result.data); setAiOpen(false); }
    catch (e) { setAiError(e.errors?.map((item) => item.msg).join(' ') || e.message); } finally { setAiBusy(false); }
  }
  if (loading) return <LoadingState label="Loading draft…" />;
  if (loadError) return <ErrorState message={loadError} />;
  return <div className="editor-layout"><form className="card form-card" onSubmit={save} noValidate><div className="section-heading"><div><h2>{announcementId ? 'Edit announcement' : 'New announcement'}</h2><p>Save a draft first. Approval and sending remain separate deliberate actions.</p></div><button className="button secondary" type="button" onClick={() => setAiOpen(!aiOpen)} aria-expanded={aiOpen}>Generate AI draft</button></div>{aiMeta && <Notice type="info">Draft suggested by <strong>{aiMeta.provider}</strong>{aiMeta.model ? ` · ${aiMeta.model}` : ''}. Review and edit before saving; it is not approved or sent.</Notice>}{error && <Notice type="error">{error}</Notice>}<label>Title<input name="title" value={values.title} onChange={change} required maxLength={250} /><span className="field-hint">{values.title.length}/250</span></label><label>Message body<textarea name="body" value={values.body} onChange={change} required maxLength={10000} rows={12} /><span className="field-hint">{values.body.length}/10,000</span></label><label>Push preview <span className="optional">Optional</span><input name="pushPreview" value={values.pushPreview} onChange={change} maxLength={120} /><span className="field-hint">{values.pushPreview.length}/120</span></label><label>Classification target <span className="optional">Optional</span><input name="classificationFilter" value={values.classificationFilter} onChange={change} maxLength={100} placeholder="Leave empty for all active members" /><span className="field-hint">Recipient count is computed only when sending.</span></label><div className="check-grid"><label className="check"><input name="needsAck" type="checkbox" checked={values.needsAck} onChange={change} /><span><strong>Require acknowledgment</strong><small>Members can confirm receipt.</small></span></label><label className="check"><input name="rsvpEnabled" type="checkbox" checked={values.rsvpEnabled} onChange={change} /><span><strong>Enable RSVP</strong><small>Members can answer yes, no, or maybe.</small></span></label></div><div className="form-actions"><button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button><button className="button ghost" type="button" onClick={() => router.back()}>Cancel</button></div></form>{aiOpen && <form className="card ai-panel" onSubmit={generate}><p className="eyebrow">Writing assistant</p><h3>Generate a starting point</h3><p>The backend chooses mock or OpenRouter mode. Suggestions always require human review.</p>{aiError && <Notice type="error">{aiError}</Notice>}<label>Topic<input name="topic" required minLength={3} maxLength={200} /></label><label>Key points<textarea name="keyPoints" required rows={5} placeholder="One point per line" /></label><label>Tone<select name="tone" defaultValue="professional"><option value="professional">Professional</option><option value="concise">Concise</option><option value="urgent">Urgent</option><option value="friendly">Friendly</option></select></label><label>Additional instructions <span className="optional">Optional</span><textarea name="additionalInstructions" maxLength={1000} rows={3} /></label><button className="button full" disabled={aiBusy}>{aiBusy ? 'Generating…' : 'Generate suggestion'}</button></form>}</div>;
}
