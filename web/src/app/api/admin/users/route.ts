import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth';
import { listAdminUsers, requireSuperAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const sp = req.nextUrl.searchParams;
    const result = await listAdminUsers({
      q: sp.get('q') || undefined,
      status: sp.get('status') || undefined,
      take: sp.get('take') ? Number(sp.get('take')) : 50,
      skip: sp.get('skip') ? Number(sp.get('skip')) : 0,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin users error', err);
    return NextResponse.json({ error: 'Could not load users' }, { status: 500 });
  }
}
