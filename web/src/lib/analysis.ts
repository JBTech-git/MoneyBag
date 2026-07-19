import { prisma } from './db';
import { categoryStyle } from './categoryStyle';
import {
  endOfDay,
  endOfMonth,
  monthLabel,
  shortMonthLabel,
  startOfDay,
  startOfMonth,
} from './dates';
import { toNum } from './money';

export type AnalysisRange = 'month' | 'week' | 'year' | 'all';
export type AnalysisType = 'all' | 'income' | 'expense';

export type AnalysisQuery = {
  year?: number;
  month?: number;
  accountId?: number | null;
  type?: AnalysisType;
  range?: AnalysisRange;
};

function resolveRange(
  year: number,
  month: number,
  range: AnalysisRange,
  lang: 'en' | 'hi' | 'bn',
) {
  const today = new Date();
  if (range === 'week') {
    const end = endOfDay(today);
    const start = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
    return { start, end, label: lang === 'hi' ? '7 दिन' : lang === 'bn' ? '৭ দিন' : 'Last 7 days' };
  }
  if (range === 'year') {
    return {
      start: startOfMonth(year, 1),
      end: endOfMonth(year, 12),
      label: String(year),
    };
  }
  if (range === 'all') {
    return {
      start: null as Date | null,
      end: null as Date | null,
      label: lang === 'hi' ? 'सभी समय' : lang === 'bn' ? 'সব সময়' : 'All time',
    };
  }
  return {
    start: startOfMonth(year, month),
    end: endOfMonth(year, month),
    label: monthLabel(year, month, lang),
  };
}

export async function getAnalysisReport(userId: string, query: AnalysisQuery = {}) {
  const { loadSettings } = await import('./settings');
  const settings = await loadSettings(userId);
  const lang = (settings.language === 'hi' || settings.language === 'bn' ? settings.language : 'en') as
    | 'en'
    | 'hi'
    | 'bn';
  const now = new Date();
  const year = query.year && query.year > 2000 ? query.year : now.getFullYear();
  const month = query.month && query.month >= 1 && query.month <= 12 ? query.month : now.getMonth() + 1;
  const type: AnalysisType = query.type === 'income' || query.type === 'expense' ? query.type : 'all';
  const range: AnalysisRange =
    query.range === 'week' || query.range === 'year' || query.range === 'all' ? query.range : 'month';
  const accountId =
    query.accountId != null && Number.isFinite(query.accountId) && query.accountId > 0
      ? Math.floor(query.accountId)
      : null;

  const { start, end, label } = resolveRange(year, month, range, lang);
  const weekStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

  const typeFilter =
    type === 'income' || type === 'expense'
      ? { transactionType: type }
      : { transactionType: { in: ['income', 'expense'] } };

  const where = {
    userId,
    ...typeFilter,
    ...(accountId ? { accountId } : {}),
    ...(start && end ? { transactionDate: { gte: start, lte: end } } : {}),
  };

  const [accounts, txs, assetsRows] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.transaction.findMany({
      where,
      select: {
        categoryName: true,
        amount: true,
        transactionDate: true,
        transactionType: true,
        accountId: true,
      },
    }),
    prisma.account.findMany({
      where: accountId
        ? { userId, id: accountId }
        : { userId, includeInTotal: true },
      select: { id: true, initialBalance: true },
    }),
  ]);

  let monthIncome = 0;
  let monthSpent = 0;
  let weekSpent = 0;
  const categoryTotals = new Map<string, number>();

  for (const t of txs) {
    const amt = toNum(t.amount);
    if (t.transactionType === 'income') {
      monthIncome += amt;
      if (type === 'income') {
        categoryTotals.set(t.categoryName, (categoryTotals.get(t.categoryName) || 0) + amt);
      }
      continue;
    }
    monthSpent += amt;
    if (type !== 'income') {
      categoryTotals.set(t.categoryName, (categoryTotals.get(t.categoryName) || 0) + amt);
    }
    if (t.transactionDate >= weekStart) weekSpent += amt;
  }

  const catBase = type === 'income' ? monthIncome : monthSpent;
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({
      name,
      amount,
      pct: catBase ? Math.round((amount / catBase) * 100) : 0,
      style: categoryStyle(name),
    }));

  // Lightweight assets total (initial + income - expense - transfer out + transfer in)
  let totalAssets = 0;
  if (assetsRows.length) {
    const ids = assetsRows.map((a) => a.id);
    const grouped = await prisma.transaction.groupBy({
      by: ['accountId', 'transactionType'],
      where: { userId, accountId: { in: ids } },
      _sum: { amount: true },
    });
    const transferIn = await prisma.transaction.groupBy({
      by: ['toAccountId'],
      where: { userId, transactionType: 'transfer', toAccountId: { in: ids } },
      _sum: { amount: true },
    });
    const byAccount = new Map<number, { income: number; expense: number; out: number; inn: number }>();
    for (const a of assetsRows) {
      byAccount.set(a.id, { income: 0, expense: 0, out: 0, inn: 0 });
    }
    for (const row of grouped) {
      const bucket = byAccount.get(row.accountId);
      if (!bucket) continue;
      const amt = toNum(row._sum.amount);
      if (row.transactionType === 'income') bucket.income = amt;
      else if (row.transactionType === 'expense') bucket.expense = amt;
      else if (row.transactionType === 'transfer') bucket.out = amt;
    }
    for (const row of transferIn) {
      if (row.toAccountId == null) continue;
      const bucket = byAccount.get(row.toAccountId);
      if (bucket) bucket.inn = toNum(row._sum.amount);
    }
    for (const a of assetsRows) {
      const b = byAccount.get(a.id)!;
      totalAssets += toNum(a.initialBalance) + b.income - b.expense - b.out + b.inn;
    }
  }

  // All-time for compare section (respect account + type filters, ignore date range)
  const allTimeWhere = {
    userId,
    ...typeFilter,
    ...(accountId ? { accountId } : {}),
  };
  const allTimeAgg = await prisma.transaction.groupBy({
    by: ['transactionType'],
    where: allTimeWhere,
    _sum: { amount: true },
  });
  const allTimeIncome = toNum(
    allTimeAgg.find((r) => r.transactionType === 'income')?._sum?.amount ?? null,
  );
  const allTimeExpense = toNum(
    allTimeAgg.find((r) => r.transactionType === 'expense')?._sum?.amount ?? null,
  );

  return {
    year,
    month,
    range,
    type,
    account_id: accountId,
    period_label: label,
    month_label: shortMonthLabel(year, month, lang),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    insights: {
      top_categories: topCategories,
      week_spent: weekSpent,
      month_spent: monthSpent,
      month_income: monthIncome,
      month_net: monthIncome - monthSpent,
      txn_count: txs.length,
      budget_used_pct: 0,
    },
    total_assets: totalAssets,
    all_time_income: allTimeIncome,
    all_time_expense: allTimeExpense,
    all_time_net: allTimeIncome - allTimeExpense,
  };
}
