import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureDefaultAccount } from '@/lib/finance';

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureDefaultAccount();
  const year = Number(body.periodYear || body.year || new Date().getFullYear());
  const month = Number(body.periodMonth || body.month || new Date().getMonth() + 1);
  const expense = await prisma.expense.create({
    data: {
      categoryName: body.categoryName || body.category_name,
      budgetedAmount: Number(body.budgetedAmount || body.budgeted_amount),
      accountId: Number(body.accountId || body.account),
      periodYear: year,
      periodMonth: month,
    },
  });
  return NextResponse.json({ ok: true, id: expense.id, message: 'Expense added' });
}
