import { prisma } from '@/lib/db';
import { toNum } from '@/lib/money';
import { formatMoneyWith, loadSettings } from '@/lib/settings';
import { ensureLegacySavingsGoalMigrated } from '@/lib/savingsGoals';

/** Compact, privacy-scoped snapshot for one subscriber only. */
export async function buildSubscriberFinanceSnapshot(userId: string) {
  const settings = await loadSettings(userId);
  await ensureLegacySavingsGoalMigrated(userId);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const money = (n: number) => formatMoneyWith(n, settings);

  const [accounts, incomes, expenses, monthTxs, goals, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      select: { id: true, name: true, accountType: true, includeInTotal: true },
      orderBy: { name: 'asc' },
      take: 30,
    }),
    prisma.income.findMany({
      where: { userId, periodYear: year, periodMonth: month },
      select: { sourceName: true, amount: true },
    }),
    prisma.expense.findMany({
      where: { userId, periodYear: year, periodMonth: month },
      select: { categoryName: true, budgetedAmount: true, actualAmount: true, isPaid: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        transactionDate: { gte: monthStart, lte: monthEnd },
        transactionType: { in: ['expense', 'income'] },
      },
      select: {
        transactionType: true,
        categoryName: true,
        amount: true,
        memo: true,
        transactionDate: true,
      },
      orderBy: { transactionDate: 'desc' },
      take: 80,
    }),
    prisma.savingsGoal
      ? prisma.savingsGoal.findMany({
          where: { userId },
          select: { name: true, targetAmount: true, currentAmount: true },
          orderBy: { sortOrder: 'asc' },
          take: 15,
        })
      : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, subscriptionStatus: true },
    }),
  ]);

  let monthIncome = 0;
  let monthExpense = 0;
  let weekExpense = 0;
  const byCategory = new Map<string, number>();

  for (const tx of monthTxs) {
    const amt = toNum(tx.amount);
    if (tx.transactionType === 'income') monthIncome += amt;
    if (tx.transactionType === 'expense') {
      monthExpense += amt;
      byCategory.set(tx.categoryName, (byCategory.get(tx.categoryName) || 0) + amt);
      if (tx.transactionDate >= weekStart) weekExpense += amt;
    }
  }

  const planned = expenses.reduce((s, e) => s + toNum(e.budgetedAmount), 0);
  const plannedIncome = incomes.reduce((s, i) => s + toNum(i.amount), 0);
  const topCategories = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({
      name,
      amount: money(amount),
      pct: monthExpense > 0 ? Math.round((amount / monthExpense) * 100) : 0,
    }));

  const recent = monthTxs.slice(0, 25).map((tx) => ({
    type: tx.transactionType,
    category: tx.categoryName,
    amount: money(toNum(tx.amount)),
    memo: (tx.memo || '').slice(0, 60),
    date: tx.transactionDate.toISOString().slice(0, 10),
  }));

  return {
    subscriber: {
      // Never send raw email to the model if avoidable — use display name only.
      display_name: (settings.displayName || user?.name || 'Member').slice(0, 60),
      subscription_status: user?.subscriptionStatus || 'unknown',
      currency: settings.currencyCode,
      language: settings.language || 'en',
    },
    period: {
      year,
      month,
      label: `${year}-${String(month).padStart(2, '0')}`,
    },
    summary: {
      month_income: money(monthIncome),
      month_expense: money(monthExpense),
      month_net: money(monthIncome - monthExpense),
      week_expense: money(weekExpense),
      budget_planned_expense: money(planned),
      budget_planned_income: money(plannedIncome),
      budget_remaining_vs_plan: money(planned - monthExpense),
      budget_used_pct: planned > 0 ? Math.round((monthExpense / planned) * 100) : 0,
    },
    wallets: accounts.map((a) => ({
      name: a.name,
      type: a.accountType,
      include_in_total: a.includeInTotal,
    })),
    income_plan: incomes.map((i) => ({
      source: i.sourceName,
      amount: money(toNum(i.amount)),
    })),
    expense_plan: expenses.map((e) => ({
      category: e.categoryName,
      budgeted: money(toNum(e.budgetedAmount)),
      actual: money(toNum(e.actualAmount)),
      paid: e.isPaid,
    })),
    top_expense_categories: topCategories,
    savings_goals: goals.map((g) => {
      const target = toNum(g.targetAmount);
      const current = toNum(g.currentAmount);
      return {
        name: g.name,
        target: money(target),
        saved: money(current),
        progress_pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
      };
    }),
    recent_transactions: recent,
  };
}

export type SubscriberFinanceSnapshot = Awaited<ReturnType<typeof buildSubscriberFinanceSnapshot>>;
