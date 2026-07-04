import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  createBudgetPaymentTransaction,
  removeBudgetPaymentTransactions,
} from '@/lib/sync';

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!expense.isPaid) {
    await createBudgetPaymentTransaction(id);
    return NextResponse.json({ ok: true, message: 'Marked as paid — added to daily ledger' });
  }
  await removeBudgetPaymentTransactions(id);
  return NextResponse.json({ ok: true, message: 'Marked as unpaid' });
}
