import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assertExpenseOwned } from '@/lib/ownership';
import {
  createBudgetPaymentTransaction,
  removeBudgetPaymentTransactions,
} from '@/lib/sync';

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(ctx.params.id);
    const expense = await assertExpenseOwned(user.id, id);

    if (!expense.isPaid) {
      await createBudgetPaymentTransaction(id);
      return NextResponse.json({ ok: true, message: 'Marked as paid — added to daily ledger' });
    }
    await removeBudgetPaymentTransactions(id);
    return NextResponse.json({ ok: true, message: 'Marked as unpaid' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 400 });
  }
}
