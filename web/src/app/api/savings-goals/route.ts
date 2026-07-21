import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureLegacySavingsGoalMigrated, serializeSavingsGoal } from '@/lib/savingsGoals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    await ensureLegacySavingsGoalMigrated(user.id);
    const goals = await prisma.savingsGoal.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json({ ok: true, goals: goals.map(serializeSavingsGoal) });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not load goals' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    const name = String(body.name || body.goal_name || '').trim().slice(0, 60);
    const target = Number(body.target_amount ?? body.targetAmount ?? body.target ?? 0);
    const current = Number(body.current_amount ?? body.currentAmount ?? body.current ?? 0);
    if (!name) {
      return NextResponse.json({ error: 'Goal name is required' }, { status: 400 });
    }
    if (!(target > 0)) {
      return NextResponse.json({ error: 'Target must be greater than 0' }, { status: 400 });
    }

    const goalsDb = prisma.savingsGoal;
    if (!goalsDb) {
      return NextResponse.json(
        { error: 'Savings goals unavailable — restart the app server' },
        { status: 503 },
      );
    }
    const count = await goalsDb.count({ where: { userId: user.id } });
    const goal = await goalsDb.create({
      data: {
        userId: user.id,
        name,
        targetAmount: target,
        currentAmount: Math.max(0, current),
        sortOrder: count,
      },
    });

    return NextResponse.json({
      ok: true,
      goal: serializeSavingsGoal(goal),
      message: 'Goal saved',
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not save goal' }, { status: 500 });
  }
}
