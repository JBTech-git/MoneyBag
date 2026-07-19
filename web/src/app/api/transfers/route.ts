import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseDatetimeLocal } from '@/lib/dates';
import { assertAccountOwned } from '@/lib/ownership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    const fromId = Number(body.from_account || body.fromAccountId || body.account);
    const toId = Number(body.to_account || body.toAccountId);
    const amount = Number(body.amount);

    if (!fromId || !toId || fromId === toId) {
      return NextResponse.json({ error: 'Choose two different wallets' }, { status: 400 });
    }
    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 });
    }

    await assertAccountOwned(user.id, fromId);
    await assertAccountOwned(user.id, toId);

    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        transactionType: 'transfer',
        categoryName: body.category_name || body.categoryName || 'Transfer',
        amount,
        memo: body.memo || '',
        accountId: fromId,
        toAccountId: toId,
        transactionDate: parseDatetimeLocal(body.txn_datetime || body.txnDatetime),
      },
    });

    return NextResponse.json({ ok: true, id: tx.id, message: 'Transfer saved' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('transfer error', err);
    return NextResponse.json({ error: 'Could not save transfer' }, { status: 500 });
  }
}
