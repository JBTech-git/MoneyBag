import { NextRequest, NextResponse } from 'next/server';
import { accountTypeMeta } from '@/lib/accounts';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assertAccountOwned } from '@/lib/ownership';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(ctx.params.id);
    await assertAccountOwned(user.id, id);
    const body = await req.json();
    const accountType = body.accountType || body.account_type || 'cash';
    const meta = accountTypeMeta(accountType);
    const isDefault = Boolean(body.is_default || body.isDefault);
    if (isDefault) {
      await prisma.account.updateMany({
        where: { userId: user.id, id: { not: id } },
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
    await assertAccountOwned(user.id, id);
    const count = await prisma.account.count({ where: { userId: user.id } });
    if (count <= 1) {
      return NextResponse.json({ error: 'Cannot delete the only account' }, { status: 400 });
    }
    const fallback = await prisma.account.findFirst({
      where: { userId: user.id, id: { not: id } },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    if (!fallback) {
      return NextResponse.json({ error: 'No fallback account' }, { status: 400 });
    }
    await prisma.transaction.updateMany({
      where: { userId: user.id, accountId: id },
      data: { accountId: fallback.id },
    });
    await prisma.income.updateMany({
      where: { userId: user.id, accountId: id },
      data: { accountId: fallback.id },
    });
    await prisma.expense.updateMany({
      where: { userId: user.id, accountId: id },
      data: { accountId: fallback.id },
    });
    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: 'Account deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 400 });
  }
}
