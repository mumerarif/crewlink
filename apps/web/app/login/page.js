import { redirect } from 'next/navigation';
import { getServerUser } from '../../lib/server-auth';
import LoginForm from '../../components/LoginForm';

export const metadata = { title: 'Sign in — CrewLink' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getServerUser();
  if (user) redirect(user.role === 'LEADER' ? '/leader' : '/member');
  return <main className="login-page"><section className="login-panel"><div className="brand login-brand"><span className="brand-symbol" aria-hidden="true">C</span><span>CrewLink<small>Member Callout</small></span></div><div className="login-copy"><p className="eyebrow">Secure local communications</p><h1>Keep every crew member in the loop.</h1><p>Create targeted callouts, follow delivery, and turn updates into clear action.</p><ul><li>Human-approved announcements</li><li>Durable simulated delivery</li><li>Read, acknowledgment, and RSVP tracking</li></ul></div></section><section className="login-form-panel"><LoginForm /></section></main>;
}
