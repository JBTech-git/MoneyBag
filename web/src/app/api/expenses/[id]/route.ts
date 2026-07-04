import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assertExpenseOwned } from '@/lib/ownership';
import {
  createBudgetPaymentTransaction,
  removeBudgetPaymentTransactions,
  syncExpenseFromTransactions,
} from '@/lib/sync';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(ctx.params.id);
    const existing = await assertExpenseOwned(user.id, id);
    const body = await req.json();
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
      where: { userId: user.id, linkedExpenseId: id },
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
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(ctx.params.id);
    await assertExpenseOwned(user.id, id);
    await prisma.transaction.updateMany({
      where: { userId: user.id, linkedExpenseId: id },
      data: { linkedExpenseId: null },
    });
    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: 'Expense deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 400 });
  }
}
