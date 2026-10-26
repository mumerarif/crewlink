'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthProvider } from './AuthContext';

const leaderLinks = [
  ['/leader', 'Overview'],
  ['/leader/announcements', 'Announcements'],
  ['/leader/announcements/new', 'Create announcement'],
  ['/leader/members', 'Members'],
];
const memberLinks = [
  ['/member', 'Overview'],
  ['/member/announcements', 'My inbox'],
  ['/member/profile', 'My profile'],
];

function NavLink({ href, label, pathname, onNavigate }) {
  const active = pathname === href || (href !== '/leader' && href !== '/member' && pathname.startsWith(href));
  return <Link className={`nav-link${active ? ' active' : ''}`} href={href} aria-current={active ? 'page' : undefined} onClick={onNavigate}>{label}</Link>;
}

export default function AppShell({ user, role, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [online, setOnline] = useState(true);
  const links = role === 'LEADER' ? leaderLinks : memberLinks;
  const title = links.find(([href]) => pathname === href)?.[1] || (pathname.includes('/announcements/') ? 'Announcement' : 'CrewLink');
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  async function logout() {
    setLoggingOut(true);
    try { await fetch('/api/session/logout', { method: 'POST' }); } finally {
      router.replace('/login');
      router.refresh();
    }
  }
  return (
    <AuthProvider user={user}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <aside id="mobile-navigation" className={`sidebar${open ? ' open' : ''}`} aria-label="Primary navigation">
          <div className="brand"><span className="brand-symbol" aria-hidden="true">C</span><span>CrewLink<small>Member Callout</small></span></div>
          <nav>{links.map(([href, label]) => <NavLink key={href} href={href} label={label} pathname={pathname} onNavigate={() => setOpen(false)} />)}</nav>
          <div className="sidebar-note"><strong>Local workspace</strong><span>{user.localId}</span></div>
        </aside>
        {open && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
        <div className="app-column">
          <header className="topbar">
            <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>☰<span className="sr-only">Toggle navigation</span></button>
            <div><p className="eyebrow">{role === 'LEADER' ? 'Leadership console' : 'Member portal'}</p><h1>{title}</h1></div>
            <div className="account-menu"><div><strong>{user.email}</strong><span>{role}</span></div><button className="button ghost small" type="button" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Signing out…' : 'Sign out'}</button></div>
          </header>
          <main id="main-content" className="page">{!online && <div className="offline-banner" role="status">You are offline. Reconnect to refresh or save changes.</div>}{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}
