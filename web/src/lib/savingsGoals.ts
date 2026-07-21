import { prisma } from '@/lib/db';
import { toNum } from '@/lib/money';

export function serializeSavingsGoal(g: {
  id: number;
  name: string;
  targetAmount: { toString(): string } | number;
  currentAmount: { toString(): string } | number;
  sortOrder: number;
}) {
  const target = toNum(g.targetAmount);
  const current = toNum(g.currentAmount);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return {
    id: g.id,
    name: g.name,
    target_amount: target,
    current_amount: current,
    progress_pct: pct,
    sort_order: g.sortOrder,
  };
}

function goalsDelegate() {
  // Stale Next/Prisma hot-reload can leave an old client without this model.
  return (prisma as { savingsGoal?: typeof prisma.savingsGoal }).savingsGoal;
}

/** One-time migrate AppSettings single goal → SavingsGoal rows. */
export async function ensureLegacySavingsGoalMigrated(userId: string) {
  const goals = goalsDelegate();
  if (!goals) return;

  const existing = await goals.count({ where: { userId } });
  if (existing > 0) return;

  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  if (!settings) return;

  const name = (settings.savingsGoalName || '').trim();
  const target = toNum(settings.savingsGoalTarget);
  const current = toNum(settings.savingsGoalCurrent);
  if (!name && !(target > 0)) return;

  await goals.create({
    data: {
      userId,
      name: name || 'Savings goal',
      targetAmount: target > 0 ? target : 1,
      currentAmount: Math.max(0, current),
      sortOrder: 0,
    },
  });
}
