import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureDefaultAccount } from '@/lib/finance';
import { assertAccountOwned } from '@/lib/ownership';

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    await ensureDefaultAccount(user.id);
    const year = Number(body.periodYear || body.year || new Date().getFullYear());
    const month = Number(body.periodMonth || body.month || new Date().getMonth() + 1);
    const accountId = Number(body.accountId || body.account);
    await assertAccountOwned(user.id, accountId);
    const expense = await prisma.expense.create({
      data: {
        userId: user.id,
        categoryName: body.categoryName || body.category_name,
        budgetedAmount: Number(body.budgetedAmount || body.budgeted_amount),
        accountId,
        periodYear: year,
        periodMonth: month,
      },
    });
    return NextResponse.json({ ok: true, id: expense.id, message: 'Expense added' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not add expense' }, { status: 500 });
  }
}
