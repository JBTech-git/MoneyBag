import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseDatetimeLocal } from '@/lib/dates';
import { ensureDefaultAccount } from '@/lib/finance';
import { assertAccountOwned } from '@/lib/ownership';
import { autoLinkTransaction, syncExpenseFromTransactions } from '@/lib/sync';

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    await ensureDefaultAccount(user.id);
    const accountId = Number(body.accountId || body.account);
    await assertAccountOwned(user.id, accountId);
    const linkedExpenseId = body.linkedExpenseId || body.linked_expense
      ? Number(body.linkedExpenseId || body.linked_expense)
      : null;
    const linkedIncomeId = body.linkedIncomeId || body.linked_income
      ? Number(body.linkedIncomeId || body.linked_income)
      : null;
    if (linkedExpenseId) {
      const exp = await prisma.expense.findFirst({
        where: { id: linkedExpenseId, userId: user.id },
      });
      if (!exp) {
        return NextResponse.json({ error: 'Budget category not found' }, { status: 400 });
      }
    }
    if (linkedIncomeId) {
      const inc = await prisma.income.findFirst({
        where: { id: linkedIncomeId, userId: user.id },
      });
      if (!inc) {
        return NextResponse.json({ error: 'Income source not found' }, { status: 400 });
      }
    }
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        transactionType: body.transactionType || body.transaction_type || 'expense',
        categoryName: body.categoryName || body.category_name || '',
        amount: Number(body.amount),
        memo: body.memo || '',
        accountId,
        transactionDate: parseDatetimeLocal(body.txn_datetime || body.txnDatetime),
        linkedIncomeId,
        linkedExpenseId,
      },
    });
    if (!tx.linkedExpenseId && !tx.linkedIncomeId) {
      await autoLinkTransaction(tx.id);
    } else if (tx.linkedExpenseId) {
      await syncExpenseFromTransactions(tx.linkedExpenseId);
    }
    return NextResponse.json({ ok: true, id: tx.id, message: 'Transaction saved' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not save transaction' }, { status: 500 });
  }
}
