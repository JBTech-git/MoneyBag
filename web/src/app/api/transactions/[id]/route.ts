import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseDatetimeLocal } from '@/lib/dates';
import { autoLinkTransaction, syncExpenseFromTransactions } from '@/lib/sync';

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const tx = await prisma.transaction.findUnique({
    where: { id: Number(ctx.params.id) },
    include: { account: true },
  });
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(tx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const body = await req.json();
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const oldExpenseId = existing.linkedExpenseId;

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      transactionType: body.transactionType || body.transaction_type || existing.transactionType,
      categoryName: body.categoryName || body.category_name,
      amount: Number(body.amount),
      memo: body.memo ?? '',
      accountId: Number(body.accountId || body.account),
      transactionDate: parseDatetimeLocal(body.txn_datetime || body.txnDatetime),
      linkedIncomeId: body.linked_income || body.linkedIncomeId
        ? Number(body.linked_income || body.linkedIncomeId)
        : null,
      linkedExpenseId: body.linked_expense || body.linkedExpenseId
        ? Number(body.linked_expense || body.linkedExpenseId)
        : null,
    },
  });

  if (oldExpenseId && oldExpenseId !== tx.linkedExpenseId) {
    await syncExpenseFromTransactions(oldExpenseId);
  }
  if (tx.linkedExpenseId) await syncExpenseFromTransactions(tx.linkedExpenseId);
  else if (!tx.linkedIncomeId) await autoLinkTransaction(tx.id);

  return NextResponse.json({ ok: true, message: 'Transaction updated' });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const linked = existing.linkedExpenseId;
  await prisma.transaction.delete({ where: { id } });
  if (linked) await syncExpenseFromTransactions(linked);
  return NextResponse.json({ ok: true, message: 'Transaction deleted' });
}
