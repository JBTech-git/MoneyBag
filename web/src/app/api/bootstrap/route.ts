import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { getAppBootstrap } from '@/lib/finance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const sp = req.nextUrl.searchParams;
    const data = await getAppBootstrap(user.id, {
      mode: sp.get('mode') || undefined,
      year: sp.get('year') ? Number(sp.get('year')) : undefined,
      month: sp.get('month') ? Number(sp.get('month')) : undefined,
      date: sp.get('date') || undefined,
      txnView: sp.get('txn_view') || undefined,
      filter: sp.get('filter') || undefined,
      tab: sp.get('tab') || undefined,
    });
    // money function can't be serialized
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { money, ...payload } = data;
    return NextResponse.json(payload);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('bootstrap error', err);
    const message = err instanceof Error ? err.message : 'Failed to load app data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
