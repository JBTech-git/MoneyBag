import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assertAccountOwned } from '@/lib/ownership';
import { serializeRecurring } from '@/lib/recurring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    const rules = await prisma.recurringRule.findMany({
      where: { userId: user.id },
      include: { account: true },
      orderBy: { nextRunAt: 'asc' },
    });
    return NextResponse.json({ ok: true, rules: rules.map(serializeRecurring) });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not load recurring' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    const accountId = Number(body.account || body.accountId);
    const amount = Number(body.amount);
    const frequency = ['daily', 'weekly', 'monthly'].includes(body.frequency)
      ? body.frequency
      : 'monthly';
    const transactionType = body.transaction_type || body.transactionType || 'expense';

    if (!accountId || !(amount > 0)) {
      return NextResponse.json({ error: 'Amount and account are required' }, { status: 400 });
    }
    await assertAccountOwned(user.id, accountId);

    let toAccountId: number | null = null;
    if (transactionType === 'transfer') {
      toAccountId = Number(body.to_account || body.toAccountId);
      if (!toAccountId || toAccountId === accountId) {
        return NextResponse.json({ error: 'Choose two different wallets' }, { status: 400 });
      }
      await assertAccountOwned(user.id, toAccountId);
    }

    const nextRunAt = body.next_run_at
      ? new Date(body.next_run_at)
      : new Date();

    const rule = await prisma.recurringRule.create({
      data: {
        userId: user.id,
        transactionType,
        categoryName: body.category_name || body.categoryName || (transactionType === 'transfer' ? 'Transfer' : 'Recurring'),
        amount,
        memo: body.memo || '',
        accountId,
        toAccountId,
        frequency,
        nextRunAt,
        isActive: true,
      },
      include: { account: true },
    });

    return NextResponse.json({
      ok: true,
      rule: serializeRecurring(rule),
      message: 'Recurring rule saved',
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('recurring create error', err);
    return NextResponse.json({ error: 'Could not save recurring' }, { status: 500 });
  }
}
