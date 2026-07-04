import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseDatetimeLocal } from '@/lib/dates';
import { ensureDefaultAccount } from '@/lib/finance';
import { autoLinkTransaction } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureDefaultAccount();
  const accountId = Number(body.accountId || body.account);
  const tx = await prisma.transaction.create({
    data: {
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
}
