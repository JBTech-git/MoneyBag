import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseDatetimeLocal } from '@/lib/dates';
import {
  assertTransactionOwned,
} from '@/lib/ownership';
import { autoLinkTransaction, syncExpenseFromTransactions } from '@/lib/sync';

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const tx = await prisma.transaction.findFirst({
      where: { id: Number(ctx.params.id), userId: user.id },
      include: { account: true },
    });
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(tx);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(ctx.params.id);
    const existing = await assertTransactionOwned(user.id, id);
    const body = await req.json();
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
    const existing = await assertTransactionOwned(user.id, id);
    const linked = existing.linkedExpenseId;
    await prisma.transaction.delete({ where: { id } });
    if (linked) await syncExpenseFromTransactions(linked);
    return NextResponse.json({ ok: true, message: 'Transaction deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 400 });
  }
}
