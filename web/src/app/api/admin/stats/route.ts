import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth';
import { getAdminStats, requireSuperAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperAdmin();
    const stats = await getAdminStats();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin stats error', err);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
