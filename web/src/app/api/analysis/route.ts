import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/auth';
import { getAnalysisReport } from '@/lib/analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const accountRaw = sp.get('account');
    const report = await getAnalysisReport(user.id, {
      year: sp.get('year') ? Number(sp.get('year')) : undefined,
      month: sp.get('month') ? Number(sp.get('month')) : undefined,
      accountId: accountRaw && accountRaw !== 'all' ? Number(accountRaw) : null,
      type: (sp.get('type') as 'all' | 'income' | 'expense') || 'all',
      range: (sp.get('range') as 'month' | 'week' | 'year' | 'all') || 'month',
    });
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('analysis error', err);
    return NextResponse.json({ error: 'Could not load analysis' }, { status: 500 });
  }
}
