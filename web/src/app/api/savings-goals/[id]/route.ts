import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { serializeSavingsGoal } from '@/lib/savingsGoals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(params.id);
    const existing = await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const body = await req.json();
    const name =
      body.name !== undefined || body.goal_name !== undefined
        ? String(body.name ?? body.goal_name ?? '').trim().slice(0, 60)
        : undefined;
    const targetRaw = body.target_amount ?? body.targetAmount ?? body.target;
    const currentRaw = body.current_amount ?? body.currentAmount ?? body.current;

    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Goal name is required' }, { status: 400 });
    }
    if (targetRaw !== undefined && !(Number(targetRaw) > 0)) {
      return NextResponse.json({ error: 'Target must be greater than 0' }, { status: 400 });
    }

    const goal = await prisma.savingsGoal.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(targetRaw !== undefined ? { targetAmount: Number(targetRaw) } : {}),
        ...(currentRaw !== undefined ? { currentAmount: Math.max(0, Number(currentRaw)) } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      goal: serializeSavingsGoal(goal),
      message: 'Goal updated',
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not update goal' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireManageAccess();
    const id = Number(params.id);
    const existing = await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    await prisma.savingsGoal.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: 'Goal deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not delete goal' }, { status: 500 });
  }
}
