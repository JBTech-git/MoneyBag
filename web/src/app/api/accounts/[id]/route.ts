import { NextRequest, NextResponse } from 'next/server';
import { accountTypeMeta } from '@/lib/accounts';
import { prisma } from '@/lib/db';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const body = await req.json();
  const accountType = body.accountType || body.account_type || 'cash';
  const meta = accountTypeMeta(accountType);
  const isDefault = Boolean(body.is_default || body.isDefault);
  if (isDefault) {
    await prisma.account.updateMany({
      where: { id: { not: id } },
      data: { isDefault: false },
    });
  }
  await prisma.account.update({
    where: { id },
    data: {
      name: body.name,
      accountType,
      initialBalance: Number(body.initialBalance ?? body.initial_balance ?? 0),
      color: meta.color,
      isDefault,
      includeInTotal: body.include_in_total !== false && body.includeInTotal !== false,
    },
  });
  return NextResponse.json({ ok: true, message: 'Account updated' });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number(ctx.params.id);
  const count = await prisma.account.count();
  if (count <= 1) {
    return NextResponse.json({ error: 'Cannot delete the only account' }, { status: 400 });
  }
  const fallback = await prisma.account.findFirst({
    where: { id: { not: id } },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  });
  if (!fallback) {
    return NextResponse.json({ error: 'No fallback account' }, { status: 400 });
  }
  await prisma.transaction.updateMany({
    where: { accountId: id },
    data: { accountId: fallback.id },
  });
  await prisma.income.updateMany({
    where: { accountId: id },
    data: { accountId: fallback.id },
  });
  await prisma.expense.updateMany({
    where: { accountId: id },
    data: { accountId: fallback.id },
  });
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ ok: true, message: 'Account deleted' });
}
