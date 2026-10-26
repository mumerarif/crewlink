'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { destinationForRole } from '../lib/api';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const email = form.get('email')?.trim(); const password = form.get('password');
    if (!email || !password) return setError('Enter both your email and password.');
    setBusy(true);
    try {
      const response = await fetch('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Invalid email or password.' : (payload.message || 'Unable to sign in.'));
      router.replace(destinationForRole(payload.data.user.role)); router.refresh();
    } catch (err) { setError(err.message || 'The service is unavailable. Try again.'); } finally { setBusy(false); }
  }
  return <div className="login-card"><p className="eyebrow">Welcome back</p><h2>Sign in to your local</h2><p className="muted">Use your CrewLink account to continue.</p>{params.get('expired') && <div className="notice warning" role="status">Your session expired. Please sign in again.</div>}{error && <div className="notice error" role="alert">{error}</div>}<form onSubmit={submit} noValidate><label>Email address<input name="email" type="email" autoComplete="username" required placeholder="you@example.test" /></label><label>Password<span className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></span></label><button className="button full" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><details className="test-accounts"><summary>Local development test accounts</summary><p><strong>Leader:</strong> leader28@example.test</p><p><strong>Member:</strong> member28@example.test</p><p>Passwords remain documented in the repository README.</p></details></div>;
}
