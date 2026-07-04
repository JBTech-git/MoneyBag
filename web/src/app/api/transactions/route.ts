import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseDatetimeLocal } from '@/lib/dates';
import { ensureDefaultAccount } from '@/lib/finance';
import { assertAccountOwned } from '@/lib/ownership';
import { autoLinkTransaction } from '@/lib/sync';

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    await ensureDefaultAccount(user.id);
    const accountId = Number(body.accountId || body.account);
    await assertAccountOwned(user.id, accountId);
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        transactionType: body.transactionType || body.transaction_type || 'expense',
        categoryName: body.categoryName || body.category_name || '',
        amount: Number(body.amount),
        memo: body.memo || '',
        accountId,
        transactionDate: parseDatetimeLocal(body.txn_datetime || body.txnDatetime),
        linkedIncomeId: body.linkedIncomeId || body.linked_income
          ? Number(body.linkedIncomeId || body.linked_income)
          : null,
        linkedExpenseId: body.linkedExpenseId || body.linked_expense
          ? Number(body.linkedExpenseId || body.linked_expense)
          : null,
      },
    });
    if (!tx.linkedExpenseId && !tx.linkedIncomeId) {
      await autoLinkTransaction(tx.id);
    }
    return NextResponse.json({ ok: true, id: tx.id, message: 'Transaction saved' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not save transaction' }, { status: 500 });
  }
}
