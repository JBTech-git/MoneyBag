import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureDefaultAccount } from '@/lib/finance';
import { createIncomeReceiptTransaction } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureDefaultAccount();
  const year = Number(body.periodYear || body.year || new Date().getFullYear());
  const month = Number(body.periodMonth || body.month || new Date().getMonth() + 1);
  const income = await prisma.income.create({
    data: {
      sourceName: body.sourceName || body.source_name,
      amount: Number(body.amount),
      accountId: Number(body.accountId || body.account),
      periodYear: year,
      periodMonth: month,
    },
  });
  if (body.record_today || body.recordToday) {
    await createIncomeReceiptTransaction(income.id);
  }
  return NextResponse.json({ ok: true, id: income.id, message: 'Income added' });
}
