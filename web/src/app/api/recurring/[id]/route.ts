import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { serializeRecurring } from '@/lib/recurring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireManageAccess();
    const id = Number(params.id);
    const existing = await prisma.recurringRule.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const body = await req.json();
    const updated = await prisma.recurringRule.update({
      where: { id },
      data: {
        isActive: typeof body.is_active === 'boolean' ? body.is_active : existing.isActive,
        categoryName: body.category_name ?? existing.categoryName,
        amount: body.amount != null ? Number(body.amount) : existing.amount,
        memo: body.memo ?? existing.memo,
        frequency: body.frequency ?? existing.frequency,
      },
      include: { account: true },
    });

    return NextResponse.json({ ok: true, rule: serializeRecurring(updated) });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not update rule' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireManageAccess();
    const id = Number(params.id);
    const existing = await prisma.recurringRule.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    await prisma.recurringRule.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: 'Rule deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not delete rule' }, { status: 500 });
  }
}
