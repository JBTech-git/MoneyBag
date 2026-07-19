export type BootstrapData = {
  settings: {
    displayName: string;
    currencyCode: string;
    currencySymbol: string;
    currencyPosition: string;
    theme: string;
    appMode: string;
    showZeroBalanceBadge: boolean;
  };
  app_mode: string;
  tab: string;
  txn_view: string;
  ledger_filter: string;
  month_year: number;
  month_num: number;
  current_month: string;
  current_month_short: string;
  selected_date_iso: string;
  selected_date_label: string;
  is_today: boolean;
  day_income: number;
  day_expense: number;
  day_net: number;
  daily_income_month: number;
  daily_expense_month: number;
  total_income: number;
  total_planned: number;
  plan_balance: number;
  is_balanced: boolean;
  show_zero_balance_badge: boolean;
  actual_spent: number;
  budget_remaining: number;
  budget_spent_pct: number;
  all_time_income: number;
  all_time_expense: number;
  all_time_net: number;
  accounts: AccountRow[];
  account_rows: { account: AccountRow; balance: number }[];
  total_assets: number;
  default_account_id: number | null;
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  budget_income_rows: BudgetRow[];
  budget_expense_rows: BudgetRow[];
  recent_activity: ActivityRow[];
  ledger_entries: LedgerEntry[];
  ledger_months: LedgerMonth[];
  calendar_days: CalendarDay[];
  expense_suggestions: string[];
  income_suggestions: string[];
  insights?: {
    top_categories: Array<{
      name: string;
      amount: number;
      pct: number;
      style: { icon: string; color: string };
    }>;
    week_spent: number;
    month_spent: number;
    budget_used_pct: number;
  };
  quick_templates?: Array<{
    id: number;
    label: string;
    transaction_type: string;
    category_name: string;
    amount: number;
    memo: string;
    account_id: number | null;
  }>;
  recurring_rules?: Array<{
    id: number;
    transaction_type: string;
    category_name: string;
    amount: number;
    memo: string;
    account_id: number;
    account_name: string;
    to_account_id: number | null;
    frequency: string;
    next_run_at: string;
    last_run_at: string | null;
    is_active: boolean;
  }>;
  counts: {
    accounts: number;
    transactions: number;
    incomes: number;
    expenses: number;
  };
};

export type AccountRow = {
  id: number;
  name: string;
  account_type: string;
  initial_balance: number;
  color: string;
  icon: string;
  type_label: string;
  is_default: boolean;
  include_in_total: boolean;
};

export type IncomeRow = {
  id: number;
  source_name: string;
  amount: number;
  account_id: number;
  account_name: string;
};

export type ExpenseRow = {
  id: number;
  category_name: string;
  budgeted_amount: number;
  actual_amount: number;
  is_paid: boolean;
  account_id: number;
  account_name: string;
};

export type BudgetRow = {
  pk: number;
  title: string;
  planned: number;
  actual: number;
  remaining: number;
  progress_pct: number;
  is_over?: boolean;
  style?: { icon: string; color: string };
};

export type ActivityRow = {
  source: string;
  kind: string;
  pk: number;
  title: string;
  subtitle: string;
  amount: number;
  style: { icon: string; color: string };
};

export type LedgerEntry = {
  kind: string;
  source: string;
  pk: number;
  title: string;
  subtitle: string;
  amount: number;
  actual?: number;
  is_paid?: boolean;
  date?: string;
  style: { icon: string; color: string };
};

export type LedgerMonth = {
  year: number;
  month: number;
  label: string;
  short_label: string;
  is_current: boolean;
  entry_count: number;
  income: number;
  expense: number;
  net: number;
  days: LedgerDaySection[];
};

export type LedgerDaySection = {
  date: string;
  label: string;
  income: number;
  expense: number;
  entries: LedgerEntry[];
};

export type CalendarDay = {
  iso: string;
  day: number;
  in_month: boolean;
  is_today: boolean;
  income: number;
  expense: number;
  has_activity: boolean;
};
