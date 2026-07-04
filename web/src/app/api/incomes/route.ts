import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureDefaultAccount } from '@/lib/finance';
import { assertAccountOwned } from '@/lib/ownership';
import { createIncomeReceiptTransaction } from '@/lib/sync';

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    await ensureDefaultAccount(user.id);
    const year = Number(body.periodYear || body.year || new Date().getFullYear());
    const month = Number(body.periodMonth || body.month || new Date().getMonth() + 1);
    const accountId = Number(body.accountId || body.account);
    await assertAccountOwned(user.id, accountId);
    const income = await prisma.income.create({
      data: {
        userId: user.id,
        sourceName: body.sourceName || body.source_name,
        amount: Number(body.amount),
        accountId,
        periodYear: year,
        periodMonth: month,
      },
    });
    if (body.record_today || body.recordToday) {
      await createIncomeReceiptTransaction(income.id);
    }
    return NextResponse.json({ ok: true, id: income.id, message: 'Income added' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not add income' }, { status: 500 });
  }
}
