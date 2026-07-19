import { prisma } from './db';
import { toNum } from './money';

function advanceNextRun(from: Date, frequency: string) {
  const next = new Date(from);
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/** Create due recurring transactions (up to 60 catch-up runs per rule). */
export async function processDueRecurring(userId: string) {
  const now = new Date();
  const due = await prisma.recurringRule.findMany({
    where: { userId, isActive: true, nextRunAt: { lte: now } },
    take: 50,
  });

  for (const rule of due) {
    let nextRun = new Date(rule.nextRunAt);
    let runs = 0;
    while (nextRun <= now && runs < 60) {
      await prisma.transaction.create({
        data: {
          userId,
          transactionType: rule.transactionType,
          categoryName: rule.categoryName,
          amount: rule.amount,
          memo: rule.memo || (rule.frequency === 'monthly' ? 'Recurring' : `Recurring · ${rule.frequency}`),
          accountId: rule.accountId,
          toAccountId: rule.toAccountId,
          transactionDate: nextRun,
        },
      });
      nextRun = advanceNextRun(nextRun, rule.frequency);
      runs += 1;
    }
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextRunAt: nextRun, lastRunAt: now },
    });
  }
}

export function serializeRecurring(rule: {
  id: number;
  transactionType: string;
  categoryName: string;
  amount: { toString(): string } | number;
  memo: string;
  accountId: number;
  toAccountId: number | null;
  frequency: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  isActive: boolean;
  account: { name: string };
}) {
  return {
    id: rule.id,
    transaction_type: rule.transactionType,
    category_name: rule.categoryName,
    amount: toNum(rule.amount),
    memo: rule.memo,
    account_id: rule.accountId,
    account_name: rule.account.name,
    to_account_id: rule.toAccountId,
    frequency: rule.frequency,
    next_run_at: rule.nextRunAt.toISOString(),
    last_run_at: rule.lastRunAt?.toISOString() ?? null,
    is_active: rule.isActive,
  };
}
