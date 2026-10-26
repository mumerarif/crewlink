import { redirect } from 'next/navigation';
import { getServerUser } from '../lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getServerUser();
  redirect(user ? (user.role === 'LEADER' ? '/leader' : '/member') : '/login');
}
