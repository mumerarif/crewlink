import AppShell from '../../components/AppShell';
import { requireRole } from '../../lib/server-auth';

export const dynamic = 'force-dynamic';
export default async function MemberLayout({ children }) { const user = await requireRole('MEMBER'); return <AppShell user={user} role="MEMBER">{children}</AppShell>; }
