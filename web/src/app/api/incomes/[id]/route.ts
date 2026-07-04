import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assertIncomeOwned } from '@/lib/ownership';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(ctx.params.id);
    await assertIncomeOwned(user.id, id);
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
      where: { userId: user.id, linkedIncomeId: id },
      data: {
        categoryName: body.sourceName || body.source_name,
        accountId: Number(body.accountId || body.account),
      },
    });
    return NextResponse.json({ ok: true, message: 'Income updated' });
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
    await assertIncomeOwned(user.id, id);
    await prisma.transaction.updateMany({
      where: { userId: user.id, linkedIncomeId: id },
      data: { linkedIncomeId: null },
    });
    await prisma.income.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: 'Income deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 400 });
  }
}
