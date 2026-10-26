import AppShell from '../../components/AppShell';
import { requireRole } from '../../lib/server-auth';

export const dynamic = 'force-dynamic';
export default async function LeaderLayout({ children }) { const user = await requireRole('LEADER'); return <AppShell user={user} role="LEADER">{children}</AppShell>; }
