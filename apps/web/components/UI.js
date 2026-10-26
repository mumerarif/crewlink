'use client';

import { useEffect, useRef } from 'react';

export function StatusBadge({ status }) {
  const value = status || 'UNKNOWN';
  return <span className={`badge badge-${value.toLowerCase().replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>;
}

export function LoadingState({ label = 'Loading…' }) {
  return <div className="state-card" role="status"><span className="spinner" />{label}</div>;
}

export function ErrorState({ message, retry }) {
  return <div className="state-card error-state" role="alert"><strong>Something went wrong</strong><p>{message}</p>{retry && <button className="button secondary small" onClick={retry}>Try again</button>}</div>;
}

export function EmptyState({ title, message, action }) {
  return <div className="state-card"><strong>{title}</strong><p>{message}</p>{action}</div>;
}

export function Notice({ type = 'success', children }) {
  return <div className={`notice ${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  return <nav className="pagination" aria-label="Pagination"><button className="button secondary small" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button className="button secondary small" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next</button></nav>;
}

export function ConfirmDialog({ open, title, children, confirmLabel, busy, danger, onConfirm, onClose }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [open, busy, onClose]);
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">{title}</h2><div>{children}</div><div className="dialog-actions"><button ref={cancelRef} className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className={`button${danger ? ' danger' : ''}`} disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></div></div></div>;
}

export function MetricCard({ label, value, detail }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
