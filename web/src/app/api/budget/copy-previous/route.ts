import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureDefaultAccount } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Copy income/expense envelopes from the previous month into the target month (skip name duplicates). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    await ensureDefaultAccount(user.id);
    const body = await req.json();
    const year = Number(body.year ?? body.periodYear ?? new Date().getFullYear());
    const month = Number(body.month ?? body.periodMonth ?? new Date().getMonth() + 1);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
    }

    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    const [prevIncomes, prevExpenses, curIncomes, curExpenses] = await Promise.all([
      prisma.income.findMany({
        where: { userId: user.id, periodYear: prevYear, periodMonth: prevMonth },
      }),
      prisma.expense.findMany({
        where: { userId: user.id, periodYear: prevYear, periodMonth: prevMonth },
      }),
      prisma.income.findMany({
        where: { userId: user.id, periodYear: year, periodMonth: month },
        select: { sourceName: true },
      }),
      prisma.expense.findMany({
        where: { userId: user.id, periodYear: year, periodMonth: month },
        select: { categoryName: true },
      }),
    ]);

    if (!prevIncomes.length && !prevExpenses.length) {
      return NextResponse.json(
        { error: 'No budget found for the previous month', copied: 0 },
        { status: 404 },
      );
    }

    const existingIncome = new Set(curIncomes.map((i) => i.sourceName.toLowerCase()));
    const existingExpense = new Set(curExpenses.map((e) => e.categoryName.toLowerCase()));

    const incomesToCreate = prevIncomes.filter(
      (i) => !existingIncome.has(i.sourceName.toLowerCase()),
    );
    const expensesToCreate = prevExpenses.filter(
      (e) => !existingExpense.has(e.categoryName.toLowerCase()),
    );

    if (!incomesToCreate.length && !expensesToCreate.length) {
      return NextResponse.json({
        ok: true,
        message: 'All previous categories already exist this month',
        copied: 0,
        incomes: 0,
        expenses: 0,
      });
    }

    await prisma.$transaction([
      ...incomesToCreate.map((i) =>
        prisma.income.create({
          data: {
            userId: user.id,
            sourceName: i.sourceName,
            amount: i.amount,
            accountId: i.accountId,
            periodYear: year,
            periodMonth: month,
          },
        }),
      ),
      ...expensesToCreate.map((e) =>
        prisma.expense.create({
          data: {
            userId: user.id,
            categoryName: e.categoryName,
            budgetedAmount: e.budgetedAmount,
            actualAmount: 0,
            isPaid: false,
            accountId: e.accountId,
            periodYear: year,
            periodMonth: month,
          },
        }),
      ),
    ]);

    const copied = incomesToCreate.length + expensesToCreate.length;
    return NextResponse.json({
      ok: true,
      message: `Copied ${copied} items from previous month`,
      copied,
      incomes: incomesToCreate.length,
      expenses: expensesToCreate.length,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not copy budget' }, { status: 500 });
  }
}
