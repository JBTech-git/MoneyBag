import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const body = await req.json();
  await prisma.income.update({
    where: { id },
    data: {
      sourceName: body.sourceName || body.source_name,
      amount: Number(body.amount),
      accountId: Number(body.accountId || body.account),
    },
  });
  await prisma.transaction.updateMany({
    where: { linkedIncomeId: id },
    data: {
      categoryName: body.sourceName || body.source_name,
      accountId: Number(body.accountId || body.account),
    },
  });
  return NextResponse.json({ ok: true, message: 'Income updated' });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  await prisma.transaction.updateMany({
    where: { linkedIncomeId: id },
    data: { linkedIncomeId: null },
  });
  await prisma.income.delete({ where: { id } });
  return NextResponse.json({ ok: true, message: 'Income deleted' });
}
