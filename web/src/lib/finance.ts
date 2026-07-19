import { prisma } from './db';
import { accountTypeMeta } from './accounts';
import { categoryStyle } from './categoryStyle';
import {
  endOfDay,
  endOfMonth,
  formatTxnTime,
  iterMonthsBack,
  localDateIso,
  monthLabel,
  parseIsoDate,
  shortDateLabel,
  shortMonthLabel,
  startOfDay,
  startOfMonth,
} from './dates';
import type { LedgerDaySection, LedgerEntry, LedgerMonth } from './types';
import { toNum } from './money';
import { formatMoneyWith, loadSettings } from './settings';
import { batchExpenseReceivedTotals, batchIncomeReceivedTotals } from './sync';
import { processDueRecurring, serializeRecurring } from './recurring';

export async function ensureDefaultAccount(userId: string) {
  const count = await prisma.account.count({ where: { userId } });
  if (count === 0) {
    return prisma.account.create({
      data: { userId, name: 'Cash', accountType: 'cash', isDefault: true, color: '#1E3A8A' },
    });
  }
  const def = await prisma.account.findFirst({ where: { userId, isDefault: true } });
  if (def) return def;
  const first = await prisma.account.findFirst({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return first!;
}

export async function computeAccountBalance(accountId: number, initialBalance: number) {
  const map = await batchComputeAccountBalances([{ id: accountId, initialBalance }]);
  return map.get(accountId) ?? initialBalance;
}

async function batchComputeAccountBalances(
  accounts: Array<{ id: number; initialBalance: { toString(): string } | number }>,
) {
  const balances = new Map<number, number>();
  if (!accounts.length) return balances;

  const accountIds = accounts.map((a) => a.id);
  const rows = await prisma.transaction.groupBy({
    by: ['accountId', 'transactionType'],
    where: { accountId: { in: accountIds } },
    _sum: { amount: true },
  });

  const transferIns = await prisma.transaction.groupBy({
    by: ['toAccountId'],
    where: {
      toAccountId: { in: accountIds },
      transactionType: 'transfer',
    },
    _sum: { amount: true },
  });

  const totals = new Map<number, { income: number; expense: number; transferOut: number }>();
  for (const row of rows) {
    const bucket = totals.get(row.accountId) || { income: 0, expense: 0, transferOut: 0 };
    if (row.transactionType === 'income') bucket.income = toNum(row._sum.amount);
    else if (row.transactionType === 'expense') bucket.expense = toNum(row._sum.amount);
    else if (row.transactionType === 'transfer') bucket.transferOut = toNum(row._sum.amount);
    totals.set(row.accountId, bucket);
  }

  const inMap = new Map<number, number>();
  for (const row of transferIns) {
    if (row.toAccountId != null) inMap.set(row.toAccountId, toNum(row._sum.amount));
  }

  for (const a of accounts) {
    const t = totals.get(a.id) || { income: 0, expense: 0, transferOut: 0 };
    const transferIn = inMap.get(a.id) || 0;
    balances.set(
      a.id,
      toNum(a.initialBalance) + t.income - t.expense - t.transferOut + transferIn,
    );
  }
  return balances;
}

function sumAggByType(
  rows: Array<{
    transactionType: string;
    _sum?: { amount?: { toString(): string } | number | null } | null;
  }>,
  type: string,
) {
  return toNum(rows.find((r) => r.transactionType === type)?._sum?.amount ?? null);
}

export type AppQuery = {
  mode?: string;
  year?: number;
  month?: number;
  date?: string;
  txnView?: string;
  filter?: string;
  tab?: string;
};

export async function getAppBootstrap(userId: string, query: AppQuery = {}) {
  const settings = await loadSettings(userId);
  await ensureDefaultAccount(userId);
  await processDueRecurring(userId);

  const mode = query.mode || settings.appMode || 'daily';
  const today = new Date();
  const selectedDate = query.date ? parseIsoDate(query.date) : today;
  const year = query.year || selectedDate.getFullYear();
  const month = query.month || selectedDate.getMonth() + 1;
  const txnView = query.txnView || (mode === 'monthly' ? 'monthly' : 'daily');
  const filter = query.filter || 'all';
  const tab = query.tab || 'home';

  const money = (n: number) => formatMoneyWith(n, settings);

  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);
  const weekStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));

  const needsLedger = tab === 'ledger';
  const needsMonthTxs =
    needsLedger && mode !== 'monthly' && (txnView === 'daily' || txnView === 'calendar');
  const needsMonthlyAccordion = needsLedger && mode === 'daily' && txnView === 'monthly';
  const needsAccountBalances =
    tab === 'accounts' || tab === 'home' || (needsLedger && txnView === 'daily' && filter === 'total');
  const needsBudgetTotals = mode === 'monthly' || tab === 'ledger' || tab === 'home';
  const needsDayMonthAggs = tab === 'home' && mode === 'daily';
  const needsInsights = tab === 'home' || tab === 'more';
  const needsTools = tab === 'home' || tab === 'more' || tab === 'ledger';

  const txInclude = { account: true, toAccount: true } as const;

  const [
    accounts,
    incomes,
    expenses,
    allTxAgg,
    recentTxs,
    monthTxs,
    dayAgg,
    monthAgg,
    insightTxs,
    templates,
    recurringRules,
  ] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.income.findMany({
      where: { userId, periodYear: year, periodMonth: month },
      include: { account: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({
      where: { userId, periodYear: year, periodMonth: month },
      include: { account: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.groupBy({
      by: ['transactionType'],
      where: { userId },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: txInclude,
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
    needsMonthTxs
      ? prisma.transaction.findMany({
          where: { userId, transactionDate: { gte: monthStart, lte: monthEnd } },
          include: txInclude,
          orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        })
      : Promise.resolve([]),
    needsDayMonthAggs
      ? prisma.transaction.groupBy({
          by: ['transactionType'],
          where: { userId, transactionDate: { gte: dayStart, lte: dayEnd } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    needsDayMonthAggs
      ? prisma.transaction.groupBy({
          by: ['transactionType'],
          where: { userId, transactionDate: { gte: monthStart, lte: monthEnd } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    needsInsights
      ? prisma.transaction.findMany({
          where: {
            userId,
            transactionType: { in: ['expense', 'income'] },
            transactionDate: { gte: monthStart, lte: monthEnd },
          },
          select: {
            categoryName: true,
            amount: true,
            transactionDate: true,
            transactionType: true,
          },
        })
      : Promise.resolve([]),
    needsTools
      ? prisma.quickTemplate.findMany({
          where: { userId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          take: 20,
        })
      : Promise.resolve([]),
    needsTools
      ? prisma.recurringRule.findMany({
          where: { userId },
          include: { account: true },
          orderBy: { nextRunAt: 'asc' },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  let dayIncome = 0;
  let dayExpense = 0;
  let dailyIncomeMonth = 0;
  let dailyExpenseMonth = 0;

  if (needsDayMonthAggs) {
    dayIncome = sumAggByType(dayAgg, 'income');
    dayExpense = sumAggByType(dayAgg, 'expense');
    dailyIncomeMonth = sumAggByType(monthAgg, 'income');
    dailyExpenseMonth = sumAggByType(monthAgg, 'expense');
  } else if (monthTxs.length) {
    const dayTxs = monthTxs.filter(
      (t) => t.transactionDate >= dayStart && t.transactionDate <= dayEnd,
    );
    dayIncome = dayTxs
      .filter((t) => t.transactionType === 'income')
      .reduce((s, t) => s + toNum(t.amount), 0);
    dayExpense = dayTxs
      .filter((t) => t.transactionType === 'expense')
      .reduce((s, t) => s + toNum(t.amount), 0);
    dailyIncomeMonth = monthTxs
      .filter((t) => t.transactionType === 'income')
      .reduce((s, t) => s + toNum(t.amount), 0);
    dailyExpenseMonth = monthTxs
      .filter((t) => t.transactionType === 'expense')
      .reduce((s, t) => s + toNum(t.amount), 0);
  }

  const totalIncome = incomes.reduce((s, i) => s + toNum(i.amount), 0);
  const totalPlanned = expenses.reduce((s, e) => s + toNum(e.budgetedAmount), 0);
  const planBalance = totalIncome - totalPlanned;

  const expenseIds = expenses.map((e) => e.id);
  const incomeIds = incomes.map((i) => i.id);
  const [expenseReceivedMap, incomeReceivedMap, balanceMap] = await Promise.all([
    needsBudgetTotals
      ? batchExpenseReceivedTotals(year, month, expenseIds)
      : Promise.resolve(new Map<number, number>()),
    needsBudgetTotals
      ? batchIncomeReceivedTotals(year, month, incomeIds)
      : Promise.resolve(new Map<number, number>()),
    needsAccountBalances
      ? batchComputeAccountBalances(accounts)
      : Promise.resolve(new Map<number, number>()),
  ]);

  let actualSpent = 0;
  if (needsBudgetTotals) {
    for (const e of expenses) {
      actualSpent += expenseReceivedMap.get(e.id) ?? 0;
    }
  }
  const budgetRemaining = totalPlanned - actualSpent;
  const budgetSpentPct = totalPlanned
    ? Math.min(100, Math.round((actualSpent / totalPlanned) * 100))
    : 0;

  const allTimeIncome = sumAggByType(allTxAgg, 'income');
  const allTimeExpense = sumAggByType(allTxAgg, 'expense');

  const accountRows = accounts.map((a) => ({
    account: serializeAccount(a),
    balance: balanceMap.get(a.id) ?? toNum(a.initialBalance),
  }));
  const totalAssets = needsAccountBalances
    ? accountRows
        .filter((r) => r.account.include_in_total)
        .reduce((s, r) => s + r.balance, 0)
    : 0;

  const budgetExpenseRows = expenses.map((e) => {
    const spent = expenseReceivedMap.get(e.id) ?? 0;
    const planned = toNum(e.budgetedAmount);
    const pct = planned ? Math.round((spent / planned) * 100) : spent ? 100 : 0;
    return {
      pk: e.id,
      title: e.categoryName,
      planned,
      actual: spent,
      remaining: planned - spent,
      progress_pct: Math.min(pct, 100),
      is_over: spent > planned,
      style: categoryStyle(e.categoryName),
    };
  });

  const budgetIncomeRows = incomes.map((i) => {
    const received = incomeReceivedMap.get(i.id) ?? 0;
    const planned = toNum(i.amount);
    const pct = planned ? Math.round((received / planned) * 100) : received ? 100 : 0;
    return {
      pk: i.id,
      title: i.sourceName,
      planned,
      actual: received,
      remaining: planned - received,
      progress_pct: Math.min(pct, 100),
      is_over: received > planned,
    };
  });

  const recentActivity = recentTxs.map((t) => {
    if (t.transactionType === 'transfer') {
      return {
        source: 'daily' as const,
        kind: 'transfer',
        pk: t.id,
        title: t.categoryName || 'Transfer',
        subtitle: `${t.account.name} → ${t.toAccount?.name || 'Wallet'} · ${formatTxnTime(t.transactionDate)}`,
        amount: toNum(t.amount),
        style: { icon: 'swap_horiz', color: '#0F766E' },
      };
    }
    return {
      source: 'daily' as const,
      kind: t.transactionType,
      pk: t.id,
      title: t.categoryName,
      subtitle: `${t.account.name} · ${formatTxnTime(t.transactionDate)}${
        t.linkedExpenseId ? ' · Budget' : t.linkedIncomeId ? ' · Salary' : ''
      }${t.memo ? ` · ${t.memo}` : ''}`,
      amount: toNum(t.amount),
      style:
        t.transactionType === 'income'
          ? { icon: 'arrow_downward', color: '#0F766E' }
          : categoryStyle(t.categoryName),
    };
  });

  const categoryTotals = new Map<string, number>();
  let weekSpent = 0;
  let monthIncomeInsight = 0;
  let monthExpenseInsight = 0;
  for (const t of insightTxs) {
    const amt = toNum(t.amount);
    if (t.transactionType === 'income') {
      monthIncomeInsight += amt;
      continue;
    }
    monthExpenseInsight += amt;
    categoryTotals.set(t.categoryName, (categoryTotals.get(t.categoryName) || 0) + amt);
    if (t.transactionDate >= weekStart) weekSpent += amt;
  }
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({
      name,
      amount,
      pct: monthExpenseInsight ? Math.round((amount / monthExpenseInsight) * 100) : 0,
      style: categoryStyle(name),
    }));

  const insights = {
    top_categories: topCategories,
    week_spent: weekSpent,
    month_spent: monthExpenseInsight,
    month_income: monthIncomeInsight,
    month_net: monthIncomeInsight - monthExpenseInsight,
    budget_used_pct: budgetSpentPct,
    txn_count: insightTxs.length,
  };

  const quickTemplates = templates.map((t) => ({
    id: t.id,
    label: t.label,
    transaction_type: t.transactionType,
    category_name: t.categoryName,
    amount: toNum(t.amount),
    memo: t.memo,
    account_id: t.accountId,
  }));

  const recurring = recurringRules.map(serializeRecurring);

  const ledgerEntries = needsLedger
    ? buildLedgerEntries(monthTxs, incomes, expenses, filter, mode)
    : [];

  let ledgerMonths: LedgerMonth[] = [];
  if (needsMonthlyAccordion) {
    const monthKeys = iterMonthsBack(year, month, 12);
    const oldest = monthKeys[monthKeys.length - 1];
    const accordionStart = startOfMonth(oldest[0], oldest[1]);
    const accordionTxs = await prisma.transaction.findMany({
      where: { userId, transactionDate: { gte: accordionStart, lte: monthEnd } },
      include: { account: true, toAccount: true },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
    });
    ledgerMonths = buildMonthlyAccordion(accordionTxs, year, month, filter);
  }

  const calendarDays =
    needsLedger && txnView === 'calendar' && mode !== 'monthly'
      ? buildCalendarDays(year, month, monthTxs)
      : [];

  const defaultAccount = accounts.find((a) => a.isDefault) || accounts[0];

  return {
    settings: {
      displayName: settings.displayName,
      currencyCode: settings.currencyCode,
      currencySymbol: settings.currencySymbol,
      currencyPosition: settings.currencyPosition,
      theme: settings.theme,
      appMode: settings.appMode,
      showZeroBalanceBadge: settings.showZeroBalanceBadge,
    },
    app_mode: mode,
    tab,
    txn_view: txnView,
    ledger_filter: filter,
    month_year: year,
    month_num: month,
    current_month: monthLabel(year, month),
    current_month_short: shortMonthLabel(year, month),
    selected_date_iso: localDateIso(selectedDate),
    selected_date_label: shortDateLabel(selectedDate),
    is_today: localDateIso(selectedDate) === localDateIso(today),
    day_income: dayIncome,
    day_expense: dayExpense,
    day_net: dayIncome - dayExpense,
    daily_income_month: dailyIncomeMonth,
    daily_expense_month: dailyExpenseMonth,
    total_income: totalIncome,
    total_planned: totalPlanned,
    plan_balance: planBalance,
    is_balanced: planBalance === 0 && totalIncome > 0,
    show_zero_balance_badge: settings.showZeroBalanceBadge,
    actual_spent: actualSpent,
    budget_remaining: budgetRemaining,
    budget_spent_pct: budgetSpentPct,
    all_time_income: allTimeIncome,
    all_time_expense: allTimeExpense,
    all_time_net: allTimeIncome - allTimeExpense,
    accounts: accounts.map(serializeAccount),
    account_rows: accountRows,
    total_assets: totalAssets,
    default_account_id: defaultAccount?.id ?? null,
    incomes: incomes.map((i) => ({
      id: i.id,
      source_name: i.sourceName,
      amount: toNum(i.amount),
      account_id: i.accountId,
      account_name: i.account.name,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      category_name: e.categoryName,
      budgeted_amount: toNum(e.budgetedAmount),
      actual_amount: toNum(e.actualAmount),
      is_paid: e.isPaid,
      account_id: e.accountId,
      account_name: e.account.name,
    })),
    budget_income_rows: budgetIncomeRows,
    budget_expense_rows: budgetExpenseRows,
    recent_activity: recentActivity,
    insights,
    quick_templates: quickTemplates,
    recurring_rules: recurring,
    ledger_entries: ledgerEntries,
    ledger_months: ledgerMonths,
    calendar_days: calendarDays,
    expense_suggestions: Array.from(new Set(expenses.map((e) => e.categoryName))),
    income_suggestions: Array.from(new Set(incomes.map((i) => i.sourceName))),
    money,
    counts: {
      accounts: accounts.length,
      transactions: 0,
      incomes: incomes.length,
      expenses: expenses.length,
    },
  };
}

function serializeAccount(a: {
  id: number;
  name: string;
  accountType: string;
  initialBalance: { toString(): string } | number;
  color: string;
  isDefault: boolean;
  includeInTotal: boolean;
}) {
  const meta = accountTypeMeta(a.accountType);
  return {
    id: a.id,
    name: a.name,
    account_type: a.accountType,
    initial_balance: toNum(a.initialBalance),
    color: a.color || meta.color,
    icon: meta.icon,
    type_label: meta.label,
    is_default: a.isDefault,
    include_in_total: a.includeInTotal,
  };
}

function passesLedgerFilter(transactionType: string, filter: string): boolean {
  if (filter === 'income') return transactionType === 'income';
  if (filter === 'expense') return transactionType === 'expense';
  if (filter === 'transfer') return transactionType === 'transfer';
  if (filter === 'total') return false;
  return true;
}

type TxRow = {
  id: number;
  transactionType: string;
  categoryName: string;
  amount: { toString(): string };
  memo: string;
  transactionDate: Date;
  linkedExpenseId: number | null;
  linkedIncomeId: number | null;
  account: { name: string };
  toAccount?: { name: string } | null;
};

function mapTransactionToLedgerEntry(t: TxRow): LedgerEntry {
  if (t.transactionType === 'transfer') {
    const toName = t.toAccount?.name || 'Wallet';
    return {
      kind: 'transfer',
      source: 'daily',
      pk: t.id,
      title: t.categoryName || 'Transfer',
      subtitle: `${t.account.name} → ${toName} · ${formatTxnTime(t.transactionDate)}${t.memo ? ` · ${t.memo}` : ''}`,
      amount: toNum(t.amount),
      date: localDateIso(t.transactionDate),
      style: { icon: 'swap_horiz', color: '#0F766E' },
    };
  }
  return {
    kind: t.transactionType,
    source: 'daily',
    pk: t.id,
    title: t.categoryName,
    subtitle: `${t.account.name} · ${formatTxnTime(t.transactionDate)}${
      t.linkedExpenseId ? ' · Budget' : t.linkedIncomeId ? ' · Salary' : ''
    }${t.memo ? ` · ${t.memo}` : ''}`,
    amount: toNum(t.amount),
    date: localDateIso(t.transactionDate),
    style:
      t.transactionType === 'income'
        ? { icon: 'arrow_downward', color: '#0F766E' }
        : categoryStyle(t.categoryName),
  };
}

function buildMonthlyAccordion(
  txs: TxRow[],
  endYear: number,
  endMonth: number,
  filter: string,
  monthsCount = 12,
): LedgerMonth[] {
  const months: LedgerMonth[] = [];

  for (const [y, m] of iterMonthsBack(endYear, endMonth, monthsCount)) {
    const mStart = startOfMonth(y, m);
    const mEnd = endOfMonth(y, m);
    const monthTxs = txs.filter((t) => t.transactionDate >= mStart && t.transactionDate <= mEnd);
    const filtered = monthTxs.filter((t) => passesLedgerFilter(t.transactionType, filter));

    const income = filtered
      .filter((t) => t.transactionType === 'income')
      .reduce((s, t) => s + toNum(t.amount), 0);
    const expense = filtered
      .filter((t) => t.transactionType === 'expense')
      .reduce((s, t) => s + toNum(t.amount), 0);

    const entries = filtered.map(mapTransactionToLedgerEntry);
    const dayMap = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const key = e.date || 'other';
      const list = dayMap.get(key) || [];
      list.push(e);
      dayMap.set(key, list);
    }

    const days: LedgerDaySection[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, list]) => ({
        date,
        label: date === 'other' ? 'Other' : shortDateLabel(parseIsoDate(date)),
        income: list.filter((x) => x.kind === 'income').reduce((s, x) => s + x.amount, 0),
        expense: list.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.amount, 0),
        entries: list,
      }));

    months.push({
      year: y,
      month: m,
      label: monthLabel(y, m),
      short_label: shortMonthLabel(y, m),
      is_current: y === endYear && m === endMonth,
      entry_count: entries.length,
      income,
      expense,
      net: income - expense,
      days,
    });
  }

  return months;
}

function buildLedgerEntries(
  monthTxs: TxRow[],
  incomes: Array<{
    id: number;
    sourceName: string;
    amount: { toString(): string };
    account: { name: string };
  }>,
  expenses: Array<{
    id: number;
    categoryName: string;
    budgetedAmount: { toString(): string };
    actualAmount: { toString(): string };
    isPaid: boolean;
    account: { name: string };
  }>,
  filter: string,
  mode: string,
) {
  if (mode === 'monthly') {
    const entries = [];
    if (filter === 'all' || filter === 'income') {
      for (const i of incomes) {
        entries.push({
          kind: 'income',
          source: 'budget',
          pk: i.id,
          title: i.sourceName,
          subtitle: i.account.name,
          amount: toNum(i.amount),
          actual: 0,
          style: { icon: 'payments', color: '#059669' },
        });
      }
    }
    if (filter === 'all' || filter === 'expense') {
      for (const e of expenses) {
        entries.push({
          kind: 'expense',
          source: 'budget',
          pk: e.id,
          title: e.categoryName,
          subtitle: `${e.account.name} · Spent ${toNum(e.actualAmount)}`,
          amount: toNum(e.budgetedAmount),
          actual: toNum(e.actualAmount),
          is_paid: e.isPaid,
          style: categoryStyle(e.categoryName),
        });
      }
    }
    return entries;
  }

  return monthTxs
    .filter((t) => passesLedgerFilter(t.transactionType, filter))
    .map(mapTransactionToLedgerEntry);
}

function buildCalendarDays(
  year: number,
  month: number,
  monthTxs: Array<{ transactionType: string; amount: { toString(): string }; transactionDate: Date }>,
) {
  const todayIso = localDateIso(new Date());
  const totals = new Map<string, { income: number; expense: number }>();
  for (const t of monthTxs) {
    const iso = localDateIso(t.transactionDate);
    const bucket = totals.get(iso) || { income: 0, expense: 0 };
    if (t.transactionType === 'income') bucket.income += toNum(t.amount);
    else if (t.transactionType === 'expense') bucket.expense += toNum(t.amount);
    totals.set(iso, bucket);
  }

  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay(); // 0 Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{
    iso: string;
    day: number;
    in_month: boolean;
    is_today: boolean;
    income: number;
    expense: number;
    has_activity: boolean;
  }> = [];

  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month - 1, -startPad + i + 1);
    cells.push({
      iso: localDateIso(d),
      day: d.getDate(),
      in_month: false,
      is_today: false,
      income: 0,
      expense: 0,
      has_activity: false,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const t = totals.get(iso) || { income: 0, expense: 0 };
    cells.push({
      iso,
      day,
      in_month: true,
      is_today: iso === todayIso,
      income: t.income,
      expense: t.expense,
      has_activity: t.income > 0 || t.expense > 0,
    });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const d = parseIsoDate(last.iso);
    d.setDate(d.getDate() + 1);
    cells.push({
      iso: localDateIso(d),
      day: d.getDate(),
      in_month: false,
      is_today: false,
      income: 0,
      expense: 0,
      has_activity: false,
    });
  }
  return cells;
}
