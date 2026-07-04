import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  createBudgetPaymentTransaction,
  removeBudgetPaymentTransactions,
  syncExpenseFromTransactions,
} from '@/lib/sync';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const body = await req.json();
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const wantPaid = Boolean(body.is_paid || body.isPaid);
  await prisma.expense.update({
    where: { id },
    data: {
      categoryName: body.categoryName || body.category_name,
      budgetedAmount: Number(body.budgetedAmount || body.budgeted_amount),
      accountId: Number(body.accountId || body.account),
    },
  });
  await prisma.transaction.updateMany({
    where: { linkedExpenseId: id },
    data: {
      categoryName: body.categoryName || body.category_name,
      accountId: Number(body.accountId || body.account),
    },
  });

  if (wantPaid && !existing.isPaid) {
    await createBudgetPaymentTransaction(id);
  } else if (!wantPaid && existing.isPaid) {
    await removeBudgetPaymentTransactions(id);
  } else {
    await syncExpenseFromTransactions(id);
  }

  return NextResponse.json({ ok: true, message: 'Expense updated' });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  await prisma.transaction.updateMany({
    where: { linkedExpenseId: id },
    data: { linkedExpenseId: null },
  });
  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true, message: 'Expense deleted' });
}
