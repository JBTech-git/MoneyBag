import { prisma } from './db';
import { accountTypeMeta } from './accounts';
import { categoryStyle } from './categoryStyle';
import {
  endOfDay,
  endOfMonth,
  formatTxnTime,
  localDateIso,
  monthLabel,
  parseIsoDate,
  shortDateLabel,
  shortMonthLabel,
  startOfDay,
  startOfMonth,
} from './dates';
import { toNum } from './money';
import { formatMoneyWith, loadSettings } from './settings';
import { expenseReceivedTotal, incomeReceivedTotal } from './sync';

export async function ensureDefaultAccount() {
  const count = await prisma.account.count();
  if (count === 0) {
    return prisma.account.create({
      data: { name: 'Cash', accountType: 'cash', isDefault: true, color: '#1E3A8A' },
    });
  }
  const def = await prisma.account.findFirst({ where: { isDefault: true } });
  if (def) return def;
  const first = await prisma.account.findFirst({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return first!;
}

export async function computeAccountBalance(accountId: number, initialBalance: number) {
  const income = await prisma.transaction.aggregate({
    where: { accountId, transactionType: 'income' },
    _sum: { amount: true },
  });
  const expense = await prisma.transaction.aggregate({
    where: { accountId, transactionType: 'expense' },
    _sum: { amount: true },
  });
  return initialBalance + toNum(income._sum.amount) - toNum(expense._sum.amount);
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

export async function getAppBootstrap(query: AppQuery = {}) {
  const settings = await loadSettings();
  await ensureDefaultAccount();

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

  const [accounts, incomes, expenses, monthTxs, dayTxs, allTxAgg, recentTxs] =
    await Promise.all([
      prisma.account.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.income.findMany({
        where: { periodYear: year, periodMonth: month },
        include: { account: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expense.findMany({
        where: { periodYear: year, periodMonth: month },
        include: { account: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.findMany({
        where: { transactionDate: { gte: monthStart, lte: monthEnd } },
        include: { account: true },
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      }),
      prisma.transaction.findMany({
        where: { transactionDate: { gte: dayStart, lte: dayEnd } },
        include: { account: true },
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      }),
      prisma.transaction.groupBy({
        by: ['transactionType'],
        _sum: { amount: true },
      }),
      prisma.transaction.findMany({
        include: { account: true },
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    ]);

  const dayIncome = dayTxs
    .filter((t) => t.transactionType === 'income')
    .reduce((s, t) => s + toNum(t.amount), 0);
  const dayExpense = dayTxs
    .filter((t) => t.transactionType === 'expense')
    .reduce((s, t) => s + toNum(t.amount), 0);
  const dailyIncomeMonth = monthTxs
    .filter((t) => t.transactionType === 'income')
    .reduce((s, t) => s + toNum(t.amount), 0);
  const dailyExpenseMonth = monthTxs
    .filter((t) => t.transactionType === 'expense')
    .reduce((s, t) => s + toNum(t.amount), 0);

  const totalIncome = incomes.reduce((s, i) => s + toNum(i.amount), 0);
  const totalPlanned = expenses.reduce((s, e) => s + toNum(e.budgetedAmount), 0);
  const planBalance = totalIncome - totalPlanned;

  let actualSpent = 0;
  for (const e of expenses) {
    actualSpent += await expenseReceivedTotal(e.id, e.periodYear, e.periodMonth);
  }
  const budgetRemaining = totalPlanned - actualSpent;
  const budgetSpentPct = totalPlanned
    ? Math.min(100, Math.round((actualSpent / totalPlanned) * 100))
    : 0;

  const allTimeIncome = toNum(
    allTxAgg.find((a) => a.transactionType === 'income')?._sum.amount,
  );
  const allTimeExpense = toNum(
    allTxAgg.find((a) => a.transactionType === 'expense')?._sum.amount,
  );

  const accountRows = await Promise.all(
    accounts.map(async (a) => ({
      account: serializeAccount(a),
      balance: await computeAccountBalance(a.id, toNum(a.initialBalance)),
    })),
  );
  const totalAssets = accountRows
    .filter((r) => r.account.include_in_total)
    .reduce((s, r) => s + r.balance, 0);

  const budgetExpenseRows = await Promise.all(
    expenses.map(async (e) => {
      const spent = await expenseReceivedTotal(e.id, e.periodYear, e.periodMonth);
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
    }),
  );

  const budgetIncomeRows = await Promise.all(
    incomes.map(async (i) => {
      const received = await incomeReceivedTotal(i.id, i.periodYear, i.periodMonth);
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
    }),
  );

  const recentActivity = recentTxs.map((t) => ({
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
        ? { icon: 'arrow_downward', color: '#059669' }
        : categoryStyle(t.categoryName),
  }));

  const ledgerEntries = buildLedgerEntries(monthTxs, incomes, expenses, filter, mode);
  const calendarDays = buildCalendarDays(year, month, monthTxs);

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
    ledger_entries: ledgerEntries,
    calendar_days: calendarDays,
    expense_suggestions: Array.from(new Set(expenses.map((e) => e.categoryName))),
    income_suggestions: Array.from(new Set(incomes.map((i) => i.sourceName))),
    money,
    counts: {
      accounts: accounts.length,
      transactions: await prisma.transaction.count(),
      incomes: await prisma.income.count(),
      expenses: await prisma.expense.count(),
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

function buildLedgerEntries(
  monthTxs: Array<{
    id: number;
    transactionType: string;
    categoryName: string;
    amount: { toString(): string };
    memo: string;
    transactionDate: Date;
    linkedExpenseId: number | null;
    linkedIncomeId: number | null;
    account: { name: string };
  }>,
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
    .filter((t) => {
      if (filter === 'income') return t.transactionType === 'income';
      if (filter === 'expense') return t.transactionType === 'expense';
      if (filter === 'total') return false;
      return true;
    })
    .map((t) => ({
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
          ? { icon: 'arrow_downward', color: '#059669' }
          : categoryStyle(t.categoryName),
    }));
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
    else bucket.expense += toNum(t.amount);
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
