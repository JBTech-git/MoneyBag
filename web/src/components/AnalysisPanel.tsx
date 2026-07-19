'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BootstrapData } from '@/lib/types';

type AnalysisType = 'all' | 'income' | 'expense';
type AnalysisRange = 'month' | 'week' | 'year' | 'all';

type AnalysisReport = {
  year: number;
  month: number;
  range: AnalysisRange;
  type: AnalysisType;
  account_id: number | null;
  period_label: string;
  month_label: string;
  accounts: Array<{ id: number; name: string }>;
  insights: {
    top_categories: Array<{
      name: string;
      amount: number;
      pct: number;
      style: { icon: string; color: string };
    }>;
    week_spent: number;
    month_spent: number;
    month_income: number;
    month_net: number;
    txn_count: number;
  };
  total_assets: number;
  all_time_income: number;
  all_time_expense: number;
  all_time_net: number;
};

type Props = {
  data: BootstrapData;
  m: (n: number) => string;
  onClose?: () => void;
};

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function DonutChart({
  income,
  expense,
  size = 148,
}: {
  income: number;
  expense: number;
  size?: number;
}) {
  const total = income + expense;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const incomeLen = total > 0 ? (income / total) * c : 0;
  const expenseLen = total > 0 ? (expense / total) * c : 0;
  const gap = total > 0 ? 6 : 0;

  return (
    <svg className="analysis-donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        className="analysis-donut__track"
        strokeWidth={stroke}
      />
      {total > 0 && (
        <>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#0F766E"
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, incomeLen - gap)} ${c}`}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#E11D48"
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, expenseLen - gap)} ${c}`}
            strokeDashoffset={-incomeLen}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </>
      )}
    </svg>
  );
}

export default function AnalysisPanel({ data, m }: Props) {
  const [year, setYear] = useState(data.month_year);
  const [month, setMonth] = useState(data.month_num);
  const [range, setRange] = useState<AnalysisRange>('month');
  const [type, setType] = useState<AnalysisType>('all');
  const [accountId, setAccountId] = useState<number | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        range,
        type,
        account: accountId === 'all' ? 'all' : String(accountId),
      });
      const res = await fetch(`/api/analysis?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load analysis');
      setReport(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analysis');
    } finally {
      setLoading(false);
    }
  }, [year, month, range, type, accountId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const insights = report?.insights;
  const monthIncome = insights?.month_income ?? 0;
  const monthSpent = insights?.month_spent ?? 0;
  const monthNet = insights?.month_net ?? 0;
  const cats = insights?.top_categories ?? [];
  const weekSpent = insights?.week_spent ?? 0;
  const flowTotal = monthIncome + monthSpent;
  const incomeShare = flowTotal > 0 ? Math.round((monthIncome / flowTotal) * 100) : 0;
  const expenseShare = flowTotal > 0 ? Math.round((monthSpent / flowTotal) * 100) : 0;
  const catMax = Math.max(...cats.map((c) => c.amount), 1);
  const allTimeIncome = report?.all_time_income ?? data.all_time_income;
  const allTimeExpense = report?.all_time_expense ?? data.all_time_expense;
  const allTimeNet = report?.all_time_net ?? data.all_time_net;
  const allMax = Math.max(allTimeIncome, allTimeExpense, 1);
  const weekRatio = monthSpent > 0 ? weekSpent / monthSpent : 0;
  const accounts = report?.accounts?.length
    ? report.accounts
    : data.accounts.map((a) => ({ id: a.id, name: a.name }));
  const periodLabel = report?.period_label || data.current_month;
  const showMonthNav = range === 'month' || range === 'year';
  const filtersActive =
    range !== 'month' ||
    type !== 'all' ||
    accountId !== 'all' ||
    year !== data.month_year ||
    month !== data.month_num;

  function clearFilters() {
    setRange('month');
    setType('all');
    setAccountId('all');
    setYear(data.month_year);
    setMonth(data.month_num);
  }

  return (
    <div className="form-sheet analysis-panel">
      <header className="analysis-head">
        <div>
          <p className="analysis-head__eyebrow">Report</p>
          <h2 className="analysis-head__title">{periodLabel}</h2>
        </div>
        <div className="analysis-head__actions">
          {filtersActive && (
            <button
              type="button"
              className="analysis-clear-filters"
              onClick={clearFilters}
              aria-label="Clear filters"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className={`analysis-filter-toggle ${filtersOpen ? 'is-open' : ''} ${filtersActive ? 'is-active' : ''}`}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
          >
            <span className="material-icons-round">tune</span>
          </button>
        </div>
      </header>

      {filtersOpen && (
      <section className="analysis-filters">
        <div className="analysis-filters__row">
          {(['month', 'week', 'year', 'all'] as AnalysisRange[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`analysis-chip ${range === r ? 'is-active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r === 'month' ? 'Month' : r === 'week' ? '7 days' : r === 'year' ? 'Year' : 'All time'}
            </button>
          ))}
        </div>

        <div className="analysis-filters__row">
          {(['all', 'income', 'expense'] as AnalysisType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`analysis-chip ${type === t ? 'is-active' : ''}`}
              onClick={() => setType(t)}
            >
              {t === 'all' ? 'All' : t === 'income' ? 'Income' : 'Expense'}
            </button>
          ))}
        </div>

        <div className="analysis-filters__controls">
          {showMonthNav ? (
            <div className="analysis-month-nav">
              <button
                type="button"
                className="analysis-month-nav__btn"
                aria-label="Previous"
                onClick={() => {
                  if (range === 'year') setYear((y) => y - 1);
                  else {
                    const next = shiftMonth(year, month, -1);
                    setYear(next.year);
                    setMonth(next.month);
                  }
                }}
              >
                <span className="material-icons-round">chevron_left</span>
              </button>
              <span className="analysis-month-nav__label">
                {range === 'year' ? String(year) : report?.month_label || `${month}/${year}`}
              </span>
              <button
                type="button"
                className="analysis-month-nav__btn"
                aria-label="Next"
                onClick={() => {
                  if (range === 'year') setYear((y) => y + 1);
                  else {
                    const next = shiftMonth(year, month, 1);
                    setYear(next.year);
                    setMonth(next.month);
                  }
                }}
              >
                <span className="material-icons-round">chevron_right</span>
              </button>
            </div>
          ) : (
            <div className="analysis-month-nav analysis-month-nav--static">
              <span className="analysis-month-nav__label">{periodLabel}</span>
            </div>
          )}

          <label className="analysis-wallet">
            <span className="material-icons-round">account_balance_wallet</span>
            <select
              value={accountId === 'all' ? 'all' : String(accountId)}
              onChange={(e) => {
                const v = e.target.value;
                setAccountId(v === 'all' ? 'all' : Number(v));
              }}
            >
              <option value="all">All wallets</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      )}

      {error && <p className="analysis-error">{error}</p>}
      {loading && !report ? (
        <p className="analysis-empty">Loading report…</p>
      ) : (
        <>
          <section className={`analysis-card analysis-card--hero ${loading ? 'is-loading' : ''}`}>
            <div className="analysis-donut-stage">
              <DonutChart income={monthIncome} expense={monthSpent} />
              <div className="analysis-donut-center">
                <span className="analysis-donut-center__label">Net</span>
                <strong className={`analysis-donut-center__value ${monthNet >= 0 ? 'is-pos' : 'is-neg'}`}>
                  {monthNet >= 0 ? '+' : '−'}{m(Math.abs(monthNet))}
                </strong>
              </div>
            </div>

            <div className="analysis-split">
              <div className="analysis-split__chip analysis-split__chip--in">
                <span className="analysis-split__dot" />
                <span className="analysis-split__label">Income</span>
                <strong className="analysis-split__amt">+{m(monthIncome)}</strong>
                <span className="analysis-split__pct">{incomeShare}%</span>
              </div>
              <div className="analysis-split__chip analysis-split__chip--out">
                <span className="analysis-split__dot" />
                <span className="analysis-split__label">Spent</span>
                <strong className="analysis-split__amt">−{m(monthSpent)}</strong>
                <span className="analysis-split__pct">{expenseShare}%</span>
              </div>
            </div>
          </section>

          <div className="analysis-pills">
            <div className="analysis-pill">
              <span className="analysis-pill__k">7 days</span>
              <span className="analysis-pill__v amount-expense">−{m(weekSpent)}</span>
            </div>
            <div className="analysis-pill">
              <span className="analysis-pill__k">Assets</span>
              <span className="analysis-pill__v">{m(report?.total_assets ?? data.total_assets)}</span>
            </div>
            <div className="analysis-pill">
              <span className="analysis-pill__k">Txns</span>
              <span className="analysis-pill__v">{insights?.txn_count ?? 0}</span>
            </div>
          </div>

          {range === 'month' && (weekSpent > 0 || monthSpent > 0) && (
            <section className="analysis-card">
              <h3 className="analysis-card__title">Week vs month</h3>
              <div className="analysis-columns">
                <div className="analysis-columns__item">
                  <div className="analysis-columns__rail">
                    <div
                      className="analysis-columns__fill analysis-columns__fill--week"
                      style={{ height: `${Math.max(10, weekRatio * 100)}%` }}
                    />
                  </div>
                  <span className="analysis-columns__name">7 days</span>
                  <span className="analysis-columns__amt amount-expense">−{m(weekSpent)}</span>
                </div>
                <div className="analysis-columns__item">
                  <div className="analysis-columns__rail">
                    <div className="analysis-columns__fill analysis-columns__fill--month" style={{ height: '100%' }} />
                  </div>
                  <span className="analysis-columns__name">Month</span>
                  <span className="analysis-columns__amt amount-expense">−{m(monthSpent)}</span>
                </div>
              </div>
            </section>
          )}

          <section className="analysis-card">
            <h3 className="analysis-card__title">
              {type === 'income' ? 'Top income sources' : 'Top categories'}
            </h3>
            {cats.length === 0 ? (
              <p className="analysis-empty">No transactions for this filter.</p>
            ) : (
              <ul className="analysis-cats">
                {cats.map((c) => (
                  <li key={c.name} className="analysis-cat-row">
                    <span
                      className="analysis-cat-row__icon"
                      style={{ background: `${c.style.color}22`, color: c.style.color }}
                    >
                      <span className="material-icons-round">{c.style.icon}</span>
                    </span>
                    <div className="analysis-cat-row__body">
                      <div className="analysis-cat-row__top">
                        <span className="analysis-cat-row__name">{c.name}</span>
                        <span className={`analysis-cat-row__amt ${type === 'income' ? 'is-in' : ''}`}>
                          {type === 'income' ? '+' : '−'}{m(c.amount)}
                        </span>
                      </div>
                      <div className="analysis-cat-row__track">
                        <span
                          className="analysis-cat-row__fill"
                          style={{
                            width: `${Math.max(6, (c.amount / catMax) * 100)}%`,
                            background: c.style.color,
                          }}
                        />
                      </div>
                      <span className="analysis-cat-row__pct">{c.pct}% of total</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="analysis-card">
            <h3 className="analysis-card__title">All time</h3>
            <div className="analysis-lifetime">
              <div className="analysis-lifetime__row">
                <div className="analysis-lifetime__meta">
                  <span className="analysis-lifetime__label is-in">Income</span>
                  <span className="analysis-lifetime__val amount-income">+{m(allTimeIncome)}</span>
                </div>
                <div className="analysis-lifetime__track">
                  <span
                    className="analysis-lifetime__fill is-in"
                    style={{ width: `${(allTimeIncome / allMax) * 100}%` }}
                  />
                </div>
              </div>
              <div className="analysis-lifetime__row">
                <div className="analysis-lifetime__meta">
                  <span className="analysis-lifetime__label is-out">Expense</span>
                  <span className="analysis-lifetime__val amount-expense">−{m(allTimeExpense)}</span>
                </div>
                <div className="analysis-lifetime__track">
                  <span
                    className="analysis-lifetime__fill is-out"
                    style={{ width: `${(allTimeExpense / allMax) * 100}%` }}
                  />
                </div>
              </div>
              <div className="analysis-lifetime__net">
                <span>Net</span>
                <strong className={allTimeNet >= 0 ? 'amount-income' : 'amount-expense'}>
                  {allTimeNet >= 0 ? '+' : '−'}{m(Math.abs(allTimeNet))}
                </strong>
              </div>
            </div>
          </section>
        </>
      )}

      <a className="btn-primary analysis-export" href="/api/export/transactions" download>
        <span className="material-icons-round">download</span>
        Export transactions CSV
      </a>
    </div>
  );
}
