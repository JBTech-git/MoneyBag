import { NextRequest, NextResponse } from 'next/server';
import { getAppBootstrap } from '@/lib/finance';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const data = await getAppBootstrap({
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
}
