import { NextResponse } from 'next/server.js';
import { getServerUser } from '../../../../lib/server-auth.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
  const response = NextResponse.json({ success: true, data: user });
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
}
