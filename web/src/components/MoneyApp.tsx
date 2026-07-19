'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { money } from '@/lib/formatClient';
import type { BootstrapData, LedgerEntry, LedgerMonth } from '@/lib/types';
import { shortDateLabel, parseIsoDate } from '@/lib/dates';
import { CURRENCY_CHOICES } from '@/lib/currencies';
import { toDatetimeLocalValue } from '@/lib/dates';
import MoneybagLoader from '@/components/MoneybagLoader';
import AuthScreen from '@/components/AuthScreen';
import PaywallScreen from '@/components/PaywallScreen';
import AnalysisPanel from '@/components/AnalysisPanel';
import { useT } from '@/components/I18nProvider';
import { LANGUAGE_LABELS, LANGUAGES, parseLanguage } from '@/lib/i18n';
import { accountTypeChoices } from '@/lib/accounts';
import type { AccessState } from '@/lib/subscription';

type SessionUser = { id: string; email: string; name: string; isAdmin?: boolean };

type Sheet =
  | null
  | { type: 'add' }
  | { type: 'transfer' }
  | { type: 'recurring' }
  | { type: 'templates' }
  | { type: 'analysis' }
  | { type: 'edit-tx'; id: number }
  | { type: 'edit-income'; id: number }
  | { type: 'edit-expense'; id: number }
  | { type: 'edit-account'; id: number }
  | { type: 'create-account' };

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function MoneyApp() {
  const { t, setLang } = useT();
  const [authPhase, setAuthPhase] = useState<'checking' | 'guest' | 'paywall' | 'readonly' | 'ready'>('checking');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<BootstrapData | null>(null);
  dataRef.current = data;
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [addType, setAddType] = useState<'expense' | 'income'>('expense');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerAccountId, setLedgerAccountId] = useState<number | 'all'>('all');

  const load = useCallback(async (params?: Partial<BootstrapData> | Record<string, string | number>) => {
    const isFirstLoad = !dataRef.current;
    if (isFirstLoad) setLoading(true);
    try {
      const p = new URLSearchParams();
      const base = dataRef.current;
      const mode = String(params?.app_mode ?? (params as { mode?: string })?.mode ?? base?.app_mode ?? 'daily');
      const year = String(params?.month_year ?? (params as { year?: number })?.year ?? base?.month_year ?? new Date().getFullYear());
      const month = String(params?.month_num ?? (params as { month?: number })?.month ?? base?.month_num ?? new Date().getMonth() + 1);
      const date = String(params?.selected_date_iso ?? (params as { date?: string })?.date ?? base?.selected_date_iso ?? '');
      const txn_view = String(params?.txn_view ?? base?.txn_view ?? 'daily');
      const filter = String(params?.ledger_filter ?? (params as { filter?: string })?.filter ?? base?.ledger_filter ?? 'all');
      const tab = String(params?.tab ?? base?.tab ?? 'home');
      p.set('mode', mode);
      p.set('year', year);
      p.set('month', month);
      if (date) p.set('date', date);
      p.set('txn_view', txn_view);
      p.set('filter', filter);
      p.set('tab', tab);
      const res = await fetch(`/api/bootstrap?${p.toString()}`, { method: 'GET', cache: 'no-store' });
      const text = await res.text();
      let json: BootstrapData & { error?: string; read_only?: boolean; access?: AccessState };
      try {
        json = text ? JSON.parse(text) : { error: 'Empty response' };
      } catch {
        throw new Error(res.status === 405
          ? 'API route not available (405). Redeploy the app on Vercel.'
          : `Invalid server response (${res.status})`);
      }
      if (!res.ok) {
        if (res.status === 402) {
          setAuthPhase('paywall');
          throw new Error(json.error || 'Trial expired');
        }
        if (res.status === 401) {
          setAuthPhase('guest');
          setUser(null);
          setAccess(null);
          throw new Error(json.error || 'Sign in required');
        }
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      if (!json.settings) {
        throw new Error('Invalid app data from server');
      }
      setData(json);
      document.documentElement.dataset.theme = json.settings.theme;
      if (json.settings.language) {
        setLang(parseLanguage(json.settings.language, 'en'));
      }
      if (json.read_only) {
        setAuthPhase('readonly');
        if (json.access) setAccess(json.access);
      } else {
        setAuthPhase('ready');
      }
    } catch (err) {
      console.error(err);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to load app',
        type: 'error',
      });
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }, [setLang]);

  const beginSession = useCallback(
    (payload: { user: SessionUser; access: AccessState }) => {
      setUser(payload.user);
      setAccess(payload.access);
      if (!payload.access.hasAccess) {
        setAuthPhase('paywall');
        setLoading(false);
        return;
      }
      setAuthPhase('ready');
      load({ mode: 'daily', tab: 'home' }).catch(console.error);
    },
    [load],
  );

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          setAuthPhase('guest');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setAuthPhase('guest');
          setLoading(false);
          return;
        }
        const json = await res.json();
        beginSession({ user: json.user, access: json.access });
      })
      .catch(() => {
        setAuthPhase('guest');
        setLoading(false);
      });
  }, [beginSession]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setData(null);
    setUser(null);
    setAccess(null);
    setAuthPhase('guest');
    setLoading(false);
  };

  const showToast = (message: string, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  };

  const refresh = async (message?: string) => {
    await load();
    if (message) showToast(message);
  };

  const api = async (url: string, method: string, body?: unknown) => {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const text = await res.text();
      let json: { error?: string; message?: string } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        showToast(`Request failed (${res.status})`, 'error');
        return null;
      }
      if (!res.ok) {
        if (res.status === 402) {
          setAuthPhase('paywall');
        }
        showToast(json.error || 'Something went wrong', 'error');
        return null;
      }
      setSheet(null);
      await refresh(json.message);
      return json;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error', 'error');
      return null;
    }
  };

  if (authPhase === 'checking') {
    return <MoneybagLoader size="lg" overlay />;
  }

  if (authPhase === 'guest') {
    return (
      <AuthScreen
        onSuccess={(payload) => {
          beginSession(payload);
        }}
      />
    );
  }

  if (authPhase === 'paywall' && user && access) {
    return (
      <PaywallScreen
        user={user}
        access={access}
        onActivated={(nextAccess) => {
          setAccess(nextAccess);
          setAuthPhase('ready');
          load({ mode: 'daily', tab: 'home' }).catch(console.error);
        }}
        onViewData={() => {
          setAuthPhase('readonly');
          load({ mode: 'daily', tab: 'home' }).catch(console.error);
        }}
        onLogout={logout}
      />
    );
  }

  const readOnly = authPhase === 'readonly';

  if ((authPhase === 'ready' || authPhase === 'readonly') && !data && loading) {
    return <MoneybagLoader size="lg" overlay />;
  }

  if (!data) {
    return (
      <>
        {loading ? (
          <MoneybagLoader size="lg" overlay />
        ) : (
          <div className="app-container flex flex-col items-center justify-center min-h-screen gap-3 px-4">
            <p className="text-md-on-surface text-center">{toast?.message || 'Could not load Moneybag'}</p>
            <button type="button" className="btn-primary px-5 py-2.5 rounded-full" onClick={() => load({ mode: 'daily', tab: 'home' })}>
              Retry
            </button>
          </div>
        )}
      </>
    );
  }

  const m = (n: number) => money(n, data.settings);
  const tab = data.tab;
  const mode = data.app_mode;
  const filteredLedgerEntries = data.ledger_entries.filter((e) => {
    if (ledgerAccountId !== 'all') {
      const matchAccount =
        e.subtitle.toLowerCase().includes(
          (data.accounts.find((a) => a.id === ledgerAccountId)?.name || '').toLowerCase(),
        );
      if (!matchAccount) return false;
    }
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.subtitle.toLowerCase().includes(q) ||
      e.kind.toLowerCase().includes(q) ||
      String(e.amount).includes(q)
    );
  });

  const changeMonth = (delta: number) => {
    const next = shiftMonth(data.month_year, data.month_num, delta);
    const date = `${next.year}-${String(next.month).padStart(2, '0')}-01`;
    load({ month_year: next.year, month_num: next.month, selected_date_iso: date });
  };

  const openPaywall = () => setAuthPhase('paywall');

  const guardEdit = (action: () => void) => {
    if (readOnly) {
      showToast(t('common.subscribeToEdit'), 'error');
      return;
    }
    action();
  };

  return (
    <div className="app-container bg-md-surface relative shadow-md-3">
      {readOnly && (
        <div className="readonly-banner">
          <span className="material-icons-round">lock</span>
          <span>{t('common.subscribeToEdit')}</span>
          <button type="button" className="readonly-banner__cta" onClick={openPaywall}>
            {t('common.subscribe')}
          </button>
        </div>
      )}
      <header className="app-header sticky top-0 z-30">
        <div className="app-header__bar">
          <div className="mode-switcher mode-switcher--compact app-header__mode">
            <button type="button" className={`mode-switcher__btn ${mode === 'daily' ? 'mode-switcher__btn--active' : ''}`} onClick={() => load({ app_mode: 'daily', txn_view: 'daily' })}>
              <span className="material-icons-round">today</span><span>{t('settings.daily')}</span>
            </button>
            <button type="button" className={`mode-switcher__btn ${mode === 'monthly' ? 'mode-switcher__btn--active' : ''}`} onClick={() => load({ app_mode: 'monthly', txn_view: 'monthly' })}>
              <span className="material-icons-round">calendar_month</span><span>{t('settings.monthly')}</span>
            </button>
          </div>
          <button type="button" id="header-add-btn" className="app-header__add" onClick={() => guardEdit(() => { setAddType(mode === 'daily' ? 'expense' : 'income'); setSheet({ type: 'add' }); })} style={{ display: tab === 'settings' || readOnly ? 'none' : undefined }}>
            <span className="material-icons-round">add</span>
            <span className="app-header__add-label">{t('home.add')}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28 px-4 pt-2" id="main-content">
        {tab === 'home' && (
          <div id="home-view">
            <MonthNav data={data} onChange={changeMonth} />
            {mode === 'daily' ? (
              <>
                <div className="mm-hero">
                  <div className="mm-hero__eyebrow">
                    <span>{data.is_today ? t('home.today') : data.selected_date_label}</span>
                    <span className="material-icons-round">today</span>
                  </div>
                  <p className="mm-hero__amount">{m(data.day_net)}</p>
                  <p className="mm-hero__caption">{t('home.dayBalance')}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="mm-hero-chip"><div className="mm-hero-chip__row"><span className="mm-hero-chip__icon mm-hero-chip__icon--income"><span className="material-icons-round">south_west</span></span><span className="mm-hero-chip__label">{t('home.income')}</span></div><p className="mm-hero-chip__value hero-income">+{m(data.day_income)}</p></div>
                    <div className="mm-hero-chip"><div className="mm-hero-chip__row"><span className="mm-hero-chip__icon mm-hero-chip__icon--expense"><span className="material-icons-round">north_east</span></span><span className="mm-hero-chip__label">{t('home.expense')}</span></div><p className="mm-hero-chip__value hero-expense">−{m(data.day_expense)}</p></div>
                  </div>
                  <div className="mm-hero__month-line">
                    <span className="material-icons-round mm-hero__month-icon">calendar_today</span>
                    <span className="hero-income">+{m(data.daily_income_month)}</span>
                    <span className="opacity-60">·</span>
                    <span className="hero-expense">−{m(data.daily_expense_month)}</span>
                  </div>
                </div>
                <div className="quick-actions quick-actions--three">
                  <button type="button" className="quick-action quick-action--expense" onClick={() => guardEdit(() => { setAddType('expense'); setSheet({ type: 'add' }); })}><span className="quick-action__icon"><span className="material-icons-round">north_east</span></span>{t('home.expense')}</button>
                  <button type="button" className="quick-action quick-action--income" onClick={() => guardEdit(() => { setAddType('income'); setSheet({ type: 'add' }); })}><span className="quick-action__icon"><span className="material-icons-round">south_west</span></span>{t('home.income')}</button>
                  <button type="button" className="quick-action quick-action--transfer" onClick={() => guardEdit(() => setSheet({ type: 'transfer' }))}><span className="quick-action__icon"><span className="material-icons-round">swap_horiz</span></span>{t('home.transfer')}</button>
                </div>
                {(data.quick_templates?.length ?? 0) > 0 && (
                  <div className="template-chips">
                    {(data.quick_templates ?? []).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="template-chip"
                        onClick={() => guardEdit(() => {
                          api('/api/transactions', 'POST', {
                            transaction_type: tpl.transaction_type,
                            category_name: tpl.category_name,
                            amount: tpl.amount,
                            memo: tpl.memo,
                            account: tpl.account_id || data.default_account_id,
                            txn_datetime: toDatetimeLocalValue(new Date()),
                          });
                        })}
                      >
                        <span className="template-chip__label">{tpl.label}</span>
                        {tpl.amount > 0 && <span className="template-chip__amt">{m(tpl.amount)}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {(data.insights?.top_categories?.length || (data.insights?.month_spent ?? 0) > 0) && (
                  <div className="insights-card">
                    <div className="insights-card__head">
                      <h2 className="insights-card__title">{t('home.thisMonth')}</h2>
                      <span className="insights-card__spent">−{m(data.insights?.month_spent ?? 0)}</span>
                    </div>
                    <div className="insights-card__meta">
                      <span>{t('home.last7Days', { amount: m(data.insights?.week_spent ?? 0) })}</span>
                      {(data.insights?.budget_used_pct ?? 0) > 0 && (
                        <span>{t('home.budgetPct', { pct: data.insights?.budget_used_pct ?? 0 })}</span>
                      )}
                    </div>
                    {(data.insights?.top_categories?.length ?? 0) > 0 && (
                      <div className="insights-card__cats">
                        {data.insights!.top_categories.slice(0, 3).map((c) => (
                          <div key={c.name} className="insights-cat">
                            <div className="insights-cat__row">
                              <span className="icon-circle" style={{ background: `${c.style.color}22`, color: c.style.color }}>
                                <span className="material-icons-round text-sm">{c.style.icon}</span>
                              </span>
                              <span className="insights-cat__name">{c.name}</span>
                              <span className="insights-cat__pct">{c.pct}%</span>
                            </div>
                            <div className="insights-cat__bar"><span style={{ width: `${c.pct}%`, background: c.style.color }} /></div>
                            <p className="insights-cat__amt amount-expense">−{m(c.amount)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" className="insights-card__more" onClick={() => setSheet({ type: 'analysis' })}>
                      {t('home.openAnalysis')}
                    </button>
                  </div>
                )}
                <div className="section-head">
                  <h2 className="section-head__title">{t('home.recent')}</h2>
                  <button type="button" className="section-icon-btn" onClick={() => load({ tab: 'ledger' })}><span className="material-icons-round">arrow_forward</span></button>
                </div>
                <ActivityList items={data.recent_activity} m={m} onOpen={(id) => guardEdit(() => setSheet({ type: 'edit-tx', id }))} />
              </>
            ) : (
              <>
                <div className="mm-hero">
                  <div className="mm-hero__eyebrow"><span>{t('home.planSuffix', { month: data.current_month_short })}</span><span className="material-icons-round">account_balance_wallet</span></div>
                  <p className="mm-hero__amount">{m(data.plan_balance)}</p>
                  <p className="mm-hero__caption">{data.is_balanced && data.show_zero_balance_badge ? t('home.fullyAllocated') : data.plan_balance > 0 ? t('home.leftToAllocate') : data.plan_balance < 0 ? t('home.overBudget') : t('home.planBalance')}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="mm-hero-chip"><div className="mm-hero-chip__row"><span className="mm-hero-chip__icon mm-hero-chip__icon--income"><span className="material-icons-round">south_west</span></span><span className="mm-hero-chip__label">{t('home.income')}</span></div><p className="mm-hero-chip__value hero-income">+{m(data.total_income)}</p></div>
                    <div className="mm-hero-chip"><div className="mm-hero-chip__row"><span className="mm-hero-chip__icon mm-hero-chip__icon--expense"><span className="material-icons-round">north_east</span></span><span className="mm-hero-chip__label">{t('home.budget')}</span></div><p className="mm-hero-chip__value hero-expense">{m(data.total_planned)}</p></div>
                  </div>
                  <div className="mm-hero__month-line">
                    <span className="material-icons-round mm-hero__month-icon">payments</span>
                    <span>{m(data.actual_spent)}</span><span className="opacity-60">·</span>
                    <span>{t('home.left', { amount: m(data.budget_remaining) })}</span><span className="opacity-60">·</span>
                    <span>{data.budget_spent_pct}%</span>
                  </div>
                </div>
                <div className="section-head">
                  <h2 className="section-head__title">{t('home.categories')}</h2>
                  <button type="button" className="section-icon-btn" onClick={() => load({ tab: 'ledger' })}><span className="material-icons-round">edit</span></button>
                </div>
                <BudgetList expenses={data.budget_expense_rows} incomes={data.budget_income_rows} m={m} onExpense={(id) => guardEdit(() => setSheet({ type: 'edit-expense', id }))} onIncome={(id) => guardEdit(() => setSheet({ type: 'edit-income', id }))} />
              </>
            )}
          </div>
        )}

        {tab === 'ledger' && (
          <div className="ledger-panel">
            <div className="ledger-top-filters">
              {mode !== 'monthly' && (
                <div className="ledger-toolbar">
                  <div className="txn-view-switcher txn-view-switcher--compact">
                    {([
                      { key: 'daily', icon: 'today', label: t('ledger.daily') },
                      { key: 'monthly', icon: 'view_list', label: t('ledger.monthly') },
                      { key: 'calendar', icon: 'calendar_month', label: t('ledger.calendar') },
                    ] as const).map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className={`txn-view-switcher__btn ${data.txn_view === v.key ? 'txn-view-switcher__btn--active' : ''}`}
                        onClick={() => load({ txn_view: v.key })}
                      >
                        <span className="material-icons-round">{v.icon}</span>
                        <span className="txn-view-switcher__label">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data.txn_view !== 'calendar' && (
                <>
                  <div className="ledger-search">
                    <span className="material-icons-round">search</span>
                    <input
                      type="search"
                      placeholder={t('form.searchPlaceholder')}
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                    />
                    <select
                      value={ledgerAccountId === 'all' ? 'all' : String(ledgerAccountId)}
                      onChange={(e) => setLedgerAccountId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      aria-label={t('form.filterWallet')}
                    >
                      <option value="all">{t('form.allWallets')}</option>
                      {data.accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-bar ledger-filter filter-bar--values">
                  {[
                    { key: 'all', icon: 'apps', label: t('ledger.all'), value: data.all_time_net, cls: data.all_time_net >= 0 ? 'amount-income' : 'amount-expense' },
                    { key: 'income', icon: 'south_west', label: t('home.income'), value: data.all_time_income, cls: 'amount-income', chip: 'filter-chip--income' },
                    { key: 'expense', icon: 'north_east', label: t('home.expense'), value: data.all_time_expense, cls: 'amount-expense', chip: 'filter-chip--expense' },
                    ...(mode !== 'monthly' ? [{ key: 'transfer', icon: 'swap_horiz', label: t('ledger.move'), value: 0, cls: '', chip: '' }] : []),
                    ...(mode !== 'monthly' ? [{ key: 'total', icon: 'account_balance', label: t('ledger.total'), value: data.all_time_net, cls: data.all_time_net >= 0 ? 'amount-income' : 'amount-expense' }] : []),
                  ].map((f) => (
                    <button key={f.key} type="button" className={`filter-chip ${f.chip || ''} ${data.ledger_filter === f.key ? 'filter-chip--active' : ''}`} onClick={() => load({ ledger_filter: f.key })}>
                      <span className="material-icons-round">{f.icon}</span>
                      <span className="filter-chip__label">{f.label}</span>
                      {f.key !== 'transfer' && <span className={`filter-chip__value ${f.cls}`}>{m(f.value)}</span>}
                    </button>
                  ))}
                  </div>
                </>
              )}
            </div>

            {data.txn_view === 'calendar' && mode !== 'monthly' ? (
              <ActivityCalendar
                days={data.calendar_days || []}
                selected={data.selected_date_iso}
                onSelect={(iso) => load({ selected_date_iso: iso, txn_view: 'daily' })}
              />
            ) : data.ledger_filter === 'total' && mode !== 'monthly' ? (
              <div className="ledger-total-summary">
                <div className="ledger-total-summary__meta">
                  <span>All time</span>
                  <span className="ledger-total-summary__hint">All transactions</span>
                </div>
                <div className="month-accordion__stats ledger-total-summary__stats">
                  <div className="month-accordion__stat month-accordion__stat--income">
                    <span className="month-accordion__stat-label">{t('home.income')}</span>
                    <span className="month-accordion__stat-value amount-income">+{m(data.all_time_income)}</span>
                  </div>
                  <div className="month-accordion__stat month-accordion__stat--expense">
                    <span className="month-accordion__stat-label">{t('home.expense')}</span>
                    <span className="month-accordion__stat-value amount-expense">−{m(data.all_time_expense)}</span>
                  </div>
                  <div className="month-accordion__stat month-accordion__stat--net">
                    <span className="month-accordion__stat-label">{t('analysis.net')}</span>
                    <span className={`month-accordion__stat-value ${data.all_time_net >= 0 ? 'amount-income' : 'amount-expense'}`}>{m(data.all_time_net)}</span>
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  {data.account_rows.map((row) => (
                    <div key={row.account.id} className="account-card">
                      <div className="icon-circle" style={{ background: `${row.account.color}22`, color: row.account.color }}>
                        <span className="material-icons-round">{row.account.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{row.account.name}</p>
                        <p className="text-xs text-md-on-surface-variant">{row.account.type_label}</p>
                      </div>
                      <p className={`font-semibold ${row.balance < 0 ? 'amount-expense' : ''}`}>{m(row.balance)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : data.txn_view === 'monthly' && mode !== 'monthly' ? (
              <MonthlyAccordion
                months={data.ledger_months || []}
                m={m}
                onOpen={(e) => guardEdit(() => setSheet({ type: 'edit-tx', id: e.pk }))}
              />
            ) : (
              <LedgerEntriesList
                entries={filteredLedgerEntries}
                groupByDay={data.txn_view === 'daily' && mode !== 'monthly'}
                m={m}
                onOpen={(e) =>
                  guardEdit(() =>
                    setSheet(
                      e.source === 'budget'
                        ? e.kind === 'income'
                          ? { type: 'edit-income', id: e.pk }
                          : { type: 'edit-expense', id: e.pk }
                        : { type: 'edit-tx', id: e.pk },
                    ),
                  )
                }
                onTogglePaid={(id) => guardEdit(() => { api(`/api/expenses/${id}/toggle-paid`, 'POST'); })}
              />
            )}
          </div>
        )}

        {tab === 'accounts' && (
          <div className="space-y-4">
            <div className="account-total-card">
              <div className="flex items-center justify-between mb-1"><span className="text-sm opacity-90">{t('home.totalAssets')}</span><span className="material-icons-round opacity-80">account_balance</span></div>
              <p className="text-2xl font-bold tracking-tight">{m(data.total_assets)}</p>
            </div>
            <div className="space-y-2">
              {data.account_rows.map((row) => (
                <div key={row.account.id} className="account-card ripple-item" onClick={() => guardEdit(() => setSheet({ type: 'edit-account', id: row.account.id }))}>
                  <div className="icon-circle" style={{ background: `${row.account.color}22`, color: row.account.color }}><span className="material-icons-round">{row.account.icon}</span></div>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="font-medium truncate">{row.account.name}</p>{row.account.is_default && <span className="account-badge">{t('home.default')}</span>}</div><p className="text-xs text-md-on-surface-variant">{row.account.type_label}</p></div>
                  <div className="text-right flex-shrink-0"><p className={`font-semibold ${row.balance < 0 ? 'amount-expense' : ''}`}>{m(row.balance)}</p><span className="material-icons-round text-md-on-surface-variant text-lg">chevron_right</span></div>
                </div>
              ))}
            </div>
            <button type="button" className="w-full py-3 rounded-full border border-md-outline text-md-primary font-medium text-sm flex items-center justify-center gap-1" onClick={() => guardEdit(() => setSheet({ type: 'create-account' }))}>
              <span className="material-icons-round text-lg">add</span> {t('home.addAccount')}
            </button>
          </div>
        )}

        {tab === 'more' && (
          <div className="more-menu"><div className="more-menu__grid">
            <button type="button" className="more-feature-card more-feature-card--settings" onClick={() => guardEdit(() => setSheet({ type: 'transfer' }))}>
              <div className="more-feature-card__icon"><span className="material-icons-round">swap_horiz</span></div>
              <div className="more-feature-card__text"><p className="more-feature-card__title">{t('more.transfer')}</p><p className="more-feature-card__desc">{t('more.transferDesc')}</p></div>
              <span className="more-feature-card__go"><span className="material-icons-round">chevron_right</span></span>
            </button>
            <button type="button" className="more-feature-card more-feature-card--settings" onClick={() => guardEdit(() => setSheet({ type: 'recurring' }))}>
              <div className="more-feature-card__icon"><span className="material-icons-round">event_repeat</span></div>
              <div className="more-feature-card__text"><p className="more-feature-card__title">{t('more.recurring')}</p><p className="more-feature-card__desc">{t('more.recurringDesc')}</p></div>
              <span className="more-feature-card__go"><span className="material-icons-round">chevron_right</span></span>
            </button>
            <button type="button" className="more-feature-card more-feature-card--settings" onClick={() => guardEdit(() => setSheet({ type: 'templates' }))}>
              <div className="more-feature-card__icon"><span className="material-icons-round">bolt</span></div>
              <div className="more-feature-card__text"><p className="more-feature-card__title">{t('more.templates')}</p><p className="more-feature-card__desc">{t('more.templatesDesc')}</p></div>
              <span className="more-feature-card__go"><span className="material-icons-round">chevron_right</span></span>
            </button>
            <button type="button" className="more-feature-card more-feature-card--settings" onClick={() => setSheet({ type: 'analysis' })}>
              <div className="more-feature-card__icon"><span className="material-icons-round">analytics</span></div>
              <div className="more-feature-card__text"><p className="more-feature-card__title">{t('more.analysis')}</p><p className="more-feature-card__desc">{t('more.analysisDesc')}</p></div>
              <span className="more-feature-card__go"><span className="material-icons-round">chevron_right</span></span>
            </button>
            <button type="button" className="more-feature-card more-feature-card--settings" onClick={() => load({ tab: 'settings' })}>
              <div className="more-feature-card__icon"><span className="material-icons-round">settings</span></div>
              <div className="more-feature-card__text"><p className="more-feature-card__title">{t('more.settings')}</p><p className="more-feature-card__desc">{t('more.settingsDesc')}</p></div>
              <span className="more-feature-card__go"><span className="material-icons-round">chevron_right</span></span>
            </button>
            {user?.isAdmin && (
              <a className="more-feature-card more-feature-card--settings" href="/admin">
                <div className="more-feature-card__icon"><span className="material-icons-round">admin_panel_settings</span></div>
                <div className="more-feature-card__text"><p className="more-feature-card__title">{t('more.admin')}</p><p className="more-feature-card__desc">{t('more.adminDesc')}</p></div>
                <span className="more-feature-card__go"><span className="material-icons-round">chevron_right</span></span>
              </a>
            )}
          </div></div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            {user && (
              <div className="settings-account-card">
                <p className="text-sm text-md-on-surface-variant">{t('settings.signedInAs')}</p>
                <p className="font-medium">{user.email}</p>
                {access?.status === 'active' && (
                  <p className="text-xs text-md-on-surface-variant mt-1">{t('settings.subscriptionActive')}</p>
                )}
                {user.isAdmin && (
                  <a href="/admin" className="admin-settings-link">
                    {t('settings.openAdmin')}
                  </a>
                )}
              </div>
            )}
            <SettingsForm data={data} onSave={async (body) => {
              if (readOnly) {
                showToast(t('common.subscribeToEdit'), 'error');
                return;
              }
              await api('/api/settings', 'PUT', body);
            }} />
            <button type="button" className="w-full py-3 rounded-full border border-md-outline text-md-on-surface font-medium text-sm" onClick={logout}>{t('common.signOut')}</button>
          </div>
        )}
      </main>

      <button id="fab" className="fab-btn fixed z-40 flex items-center justify-center" onClick={() => guardEdit(() => { setAddType(mode === 'daily' ? 'expense' : 'income'); setSheet({ type: 'add' }); })} style={{ display: tab === 'settings' || readOnly ? 'none' : undefined }} aria-label="Add">
        <span className="material-icons-round text-3xl">add</span>
      </button>

      <nav className="app-nav" aria-label="Main">
        <div className="app-nav__inner">
          <div className="app-nav__brand" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/Money-bag-5.png" alt="" className="app-nav__brand-icon-img" width={40} height={40} />
            <div className="app-nav__brand-text"><span className="app-nav__brand-title">Moneybag</span><span className="app-nav__brand-sub">{t('nav.brand')}</span></div>
          </div>
          <p className="app-nav__section">{t('home.menu')}</p>
          {[
            { id: 'home', icon: 'home', label: t('nav.home') },
            { id: 'ledger', icon: 'receipt_long', label: t('nav.activity') },
            { id: 'accounts', icon: 'account_balance_wallet', label: t('nav.wallets') },
            { id: 'more', icon: 'more_horiz', label: t('nav.more') },
          ].map((n) => (
            <button key={n.id} type="button" className={`nav-item flex flex-col items-center justify-center flex-1 ${tab === n.id || (n.id === 'more' && tab === 'settings') ? 'active' : ''}`} onClick={() => load({ tab: n.id })}>
              <span className="material-icons-round text-[22px]">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {sheet && (
        <>
          <div className="sheet-backdrop fixed inset-0 z-50 bg-black/40 open" onClick={() => setSheet(null)} />
          <div
            className={`bottom-sheet fixed bottom-0 w-full z-[60] bg-md-surface shadow-md-3 open overflow-y-auto ${
              sheet.type === 'analysis'
                ? 'bottom-sheet--fullscreen'
                : 'rounded-t-[28px] max-h-[85dvh]'
            }`}
          >
            <div className={`sticky top-0 bg-md-surface z-10 px-4 ${sheet.type === 'analysis' ? 'pt-4 pb-2' : 'pt-3 pb-2'}`}>
              {sheet.type === 'analysis' ? (
                <div className="analysis-sheet-bar">
                  <button type="button" className="analysis-sheet-bar__back" onClick={() => setSheet(null)} aria-label="Close analysis">
                    <span className="material-icons-round">arrow_back</span>
                  </button>
                  <span className="analysis-sheet-bar__title">{t('more.analysis')}</span>
                  <span className="analysis-sheet-bar__spacer" />
                </div>
              ) : (
                <button type="button" onClick={() => setSheet(null)} className="flex justify-center w-full py-1" aria-label="Close">
                  <span className="w-8 h-1 rounded-full bg-md-outline/40" />
                </button>
              )}
            </div>
            <div className={`pb-8 ${sheet.type === 'analysis' ? 'px-4 sm:px-6' : 'px-6'}`}>
              {sheet.type === 'add' && mode === 'daily' && (
                <DailyAddForm data={data} addType={addType} setAddType={setAddType} onSubmit={(body) => api('/api/transactions', 'POST', body)} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'add' && mode === 'monthly' && (
                <BudgetAddForm data={data} addType={addType} setAddType={setAddType} onIncome={(b) => api('/api/incomes', 'POST', b)} onExpense={(b) => api('/api/expenses', 'POST', b)} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'transfer' && (
                <TransferForm data={data} onSubmit={(b) => api('/api/transfers', 'POST', b)} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'recurring' && (
                <RecurringForm
                  data={data}
                  onCreate={(b) => api('/api/recurring', 'POST', b)}
                  onToggle={(id, is_active) => api(`/api/recurring/${id}`, 'PUT', { is_active })}
                  onDelete={(id) => api(`/api/recurring/${id}`, 'DELETE')}
                  onClose={() => setSheet(null)}
                />
              )}
              {sheet.type === 'templates' && (
                <TemplatesForm
                  data={data}
                  onCreate={(b) => api('/api/templates', 'POST', b)}
                  onDelete={(id) => api(`/api/templates/${id}`, 'DELETE')}
                  onClose={() => setSheet(null)}
                />
              )}
              {sheet.type === 'analysis' && (
                <AnalysisPanel data={data} m={m} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'create-account' && (
                <AccountForm onSubmit={(b) => api('/api/accounts', 'POST', b)} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'edit-account' && (
                <AccountForm account={data.accounts.find((a) => a.id === sheet.id)} onSubmit={(b) => api(`/api/accounts/${sheet.id}`, 'PUT', b)} onDelete={() => api(`/api/accounts/${sheet.id}`, 'DELETE')} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'edit-tx' && (
                <TxEditForm data={data} id={sheet.id} onSubmit={(b) => api(`/api/transactions/${sheet.id}`, 'PUT', b)} onDelete={() => api(`/api/transactions/${sheet.id}`, 'DELETE')} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'edit-income' && (
                <IncomeEditForm data={data} id={sheet.id} onSubmit={(b) => api(`/api/incomes/${sheet.id}`, 'PUT', b)} onDelete={() => api(`/api/incomes/${sheet.id}`, 'DELETE')} onClose={() => setSheet(null)} />
              )}
              {sheet.type === 'edit-expense' && (
                <ExpenseEditForm data={data} id={sheet.id} onSubmit={(b) => api(`/api/expenses/${sheet.id}`, 'PUT', b)} onDelete={() => api(`/api/expenses/${sheet.id}`, 'DELETE')} onClose={() => setSheet(null)} />
              )}
            </div>
          </div>
        </>
      )}

      <div id="toast-host" aria-live="polite">
        {toast && (
          <div className={`app-toast app-toast--${toast.type} show`}>
            <span className="material-icons-round">{toast.type === 'error' ? 'error' : 'check_circle'}</span>
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerEntryRow({
  entry,
  m,
  onOpen,
  onTogglePaid,
}: {
  entry: LedgerEntry;
  m: (n: number) => string;
  onOpen: (e: LedgerEntry) => void;
  onTogglePaid?: (id: number) => void;
}) {
  return (
    <div
      className={`mm-transaction ripple-item flex items-center gap-3 px-4 py-3 cursor-pointer ${entry.is_paid ? 'paid-item' : ''}`}
      onClick={() => onOpen(entry)}
    >
      <div className="icon-circle" style={{ background: `${entry.style.color}22`, color: entry.style.color }}>
        <span className="material-icons-round">{entry.style.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{entry.title}</p>
        <p className="text-xs text-md-on-surface-variant">{entry.subtitle}</p>
      </div>
      <p className={`font-semibold ${entry.kind === 'income' ? 'amount-income' : entry.kind === 'transfer' ? 'text-md-primary' : 'amount-expense'}`}>
        {entry.kind === 'income' ? '+' : entry.kind === 'transfer' ? '' : '−'}
        {m(entry.amount)}
      </p>
      {entry.source === 'budget' && entry.kind === 'expense' && onTogglePaid && (
        <button
          type="button"
          className={`pay-btn ${entry.is_paid ? 'pay-btn--paid' : ''}`}
          onClick={(ev) => {
            ev.stopPropagation();
            onTogglePaid(entry.pk);
          }}
        >
          <span className="material-icons-round">{entry.is_paid ? 'check_circle' : 'radio_button_unchecked'}</span>
          <span className="pay-btn__label">{entry.is_paid ? 'Paid' : 'Pay'}</span>
        </button>
      )}
    </div>
  );
}

function MonthlyAccordion({
  months,
  m,
  onOpen,
}: {
  months: LedgerMonth[];
  m: (n: number) => string;
  onOpen: (e: LedgerEntry) => void;
}) {
  const { t } = useT();
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Set<string>();
    for (const month of months) {
      if (month.is_current) next.add(`${month.year}-${month.month}`);
    }
    if (next.size === 0 && months[0]) next.add(`${months[0].year}-${months[0].month}`);
    setOpenKeys(next);
  }, [months]);

  const toggle = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleMonths = months.filter((month) => month.entry_count > 0);

  if (!visibleMonths.length) {
    return (
      <div className="empty-state">
        <span className="material-icons-round">receipt_long</span>
        <p className="font-medium">{t('home.noTransactions')}</p>
      </div>
    );
  }

  return (
    <div className="month-accordion ledger-list">
      {visibleMonths.map((month) => {
        const key = `${month.year}-${month.month}`;
        const isOpen = openKeys.has(key);
        return (
          <div key={key} className={`month-accordion__item${isOpen ? ' month-accordion__item--open' : ''}`}>
            <button
              type="button"
              className="month-accordion__header ripple-item"
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
            >
              <div className="month-accordion__top">
                <div className="month-accordion__info">
                  <span className="month-accordion__label">{month.short_label}</span>
                  <span className="month-accordion__count">
                    {month.entry_count} {month.entry_count === 1 ? t('ledger.entry') : t('ledger.entries')}
                  </span>
                </div>
                <span className="material-icons-round month-accordion__chevron">expand_more</span>
              </div>
              <div className="month-accordion__stats">
                <div className="month-accordion__stat month-accordion__stat--income">
                  <span className="month-accordion__stat-label">{t('home.income')}</span>
                  <span className="month-accordion__stat-value amount-income">+{m(month.income)}</span>
                </div>
                <div className="month-accordion__stat month-accordion__stat--expense">
                  <span className="month-accordion__stat-label">{t('home.expense')}</span>
                  <span className="month-accordion__stat-value amount-expense">−{m(month.expense)}</span>
                </div>
                <div className="month-accordion__stat month-accordion__stat--net">
                  <span className="month-accordion__stat-label">{t('analysis.net')}</span>
                  <span className={`month-accordion__stat-value ${month.net >= 0 ? 'amount-income' : 'amount-expense'}`}>
                    {m(month.net)}
                  </span>
                </div>
              </div>
            </button>
            {isOpen && (
              <div className="month-accordion__body px-3 pb-3">
                {month.days.length ? (
                  month.days.map((day) => (
                    <div key={day.date} className="month-accordion__day">
                      <div className="ledger-day__header">
                        <span className="ledger-day__label">{day.label}</span>
                        <span className={`ledger-day__net ${day.income - day.expense >= 0 ? 'amount-income' : 'amount-expense'}`}>
                          {m(day.income - day.expense)}
                        </span>
                      </div>
                      <div className="ledger-day__totals">
                        <span className="amount-income">+{m(day.income)}</span>
                        <span className="text-md-on-surface-variant">·</span>
                        <span className="amount-expense">−{m(day.expense)}</span>
                      </div>
                      <div className="ledger-day__card account-ledger-list">
                        {day.entries.map((entry) => (
                          <LedgerEntryRow key={`${entry.source}-${entry.pk}`} entry={entry} m={m} onOpen={onOpen} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="month-accordion__empty">{t('home.noTransactions')}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LedgerEntriesList({
  entries,
  groupByDay,
  m,
  onOpen,
  onTogglePaid,
}: {
  entries: LedgerEntry[];
  groupByDay: boolean;
  m: (n: number) => string;
  onOpen: (e: LedgerEntry) => void;
  onTogglePaid: (id: number) => void;
}) {
  if (!entries.length) {
    return (
      <div className="empty-state">
        <span className="material-icons-round">receipt_long</span>
        <p className="font-medium">No items</p>
      </div>
    );
  }

  const renderRow = (e: LedgerEntry) => (
    <LedgerEntryRow key={`${e.source}-${e.pk}`} entry={e} m={m} onOpen={onOpen} onTogglePaid={onTogglePaid} />
  );

  if (!groupByDay) {
    return <div className="space-y-2">{entries.map(renderRow)}</div>;
  }

  const groups = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const key = e.date || 'other';
    const list = groups.get(key) || [];
    list.push(e);
    groups.set(key, list);
  }

  return (
    <div>
      {Array.from(groups.entries()).map(([date, list]) => {
        const income = list.filter((x) => x.kind === 'income').reduce((s, x) => s + x.amount, 0);
        const expense = list.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.amount, 0);
        const label = date === 'other' ? 'Other' : shortDateLabel(parseIsoDate(date));
        return (
          <div key={date} className="ledger-day-group">
            <div className="ledger-day-group__head">
              <span>{label}</span>
              <span className="ledger-day-group__meta">
                <span className="amount-income">+{m(income)}</span>
                {' · '}
                <span className="amount-expense">−{m(expense)}</span>
              </span>
            </div>
            <div className="space-y-2">{list.map(renderRow)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityCalendar({
  days,
  selected,
  onSelect,
}: {
  days: BootstrapData['calendar_days'];
  selected: string;
  onSelect: (iso: string) => void;
}) {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (!days?.length) {
    return (
      <div className="empty-state">
        <span className="material-icons-round">calendar_month</span>
        <p className="font-medium">No calendar data</p>
      </div>
    );
  }
  return (
    <div className="mm-calendar">
      <div className="mm-calendar__weekdays">
        {weekdays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mm-calendar__grid">
        {days.map((cell) => (
          <button
            key={cell.iso}
            type="button"
            className={[
              'mm-calendar__cell',
              !cell.in_month ? 'mm-calendar__cell--muted' : '',
              cell.is_today ? 'mm-calendar__cell--today' : '',
              cell.iso === selected ? 'mm-calendar__cell--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => cell.in_month && onSelect(cell.iso)}
          >
            <span className="mm-calendar__day">{cell.day}</span>
            <span className="mm-calendar__dots">
              {cell.income > 0 && <span className="mm-calendar__dot mm-calendar__dot--income" />}
              {cell.expense > 0 && <span className="mm-calendar__dot mm-calendar__dot--expense" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthNav({ data, onChange }: { data: BootstrapData; onChange: (d: number) => void }) {
  const { t } = useT();
  return (
    <div className="month-nav">
      <button type="button" className="month-nav__btn" onClick={() => onChange(-1)} aria-label={t('common.previous')}><span className="material-icons-round">chevron_left</span></button>
      <div className="month-nav__label">
        <span className="month-nav__month">{data.current_month}</span>
        <span className="month-nav__hint">{data.app_mode === 'daily' ? (data.is_today ? `${t('home.today')} · ${data.selected_date_label}` : data.selected_date_label) : t('home.salaryPlan')}</span>
      </div>
      <button type="button" className="month-nav__btn" onClick={() => onChange(1)} aria-label={t('common.next')}><span className="material-icons-round">chevron_right</span></button>
    </div>
  );
}

function ActivityList({ items, m, onOpen }: { items: BootstrapData['recent_activity']; m: (n: number) => string; onOpen: (id: number) => void }) {
  const { t } = useT();
  if (!items.length) return <div className="empty-state"><span className="material-icons-round">receipt_long</span><p className="font-medium">{t('home.noActivity')}</p></div>;
  return (
    <div className="space-y-2">
      {items.map((e) => (
        <div key={e.pk} className="mm-transaction ripple-item flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => onOpen(e.pk)}>
          <div className="icon-circle" style={{ background: `${e.style.color}22`, color: e.style.color }}><span className="material-icons-round">{e.style.icon}</span></div>
          <div className="flex-1 min-w-0"><p className="font-medium truncate">{e.title}</p><p className="text-xs text-md-on-surface-variant">{e.subtitle}</p></div>
          <p className={`font-semibold ${e.kind === 'income' ? 'amount-income' : e.kind === 'transfer' ? 'text-md-primary' : 'amount-expense'}`}>{e.kind === 'income' ? '+' : e.kind === 'transfer' ? '' : '−'}{m(e.amount)}</p>
        </div>
      ))}
    </div>
  );
}

function BudgetList({ expenses, incomes, m, onExpense, onIncome }: { expenses: BootstrapData['budget_expense_rows']; incomes: BootstrapData['budget_income_rows']; m: (n: number) => string; onExpense: (id: number) => void; onIncome: (id: number) => void }) {
  const { t } = useT();
  if (!expenses.length && !incomes.length) return <div className="empty-state"><span className="material-icons-round">event_note</span><p className="font-medium">{t('home.noBudgetYet')}</p></div>;
  return (
    <div className="budget-progress-list">
      {expenses.length > 0 && <p className="text-xs font-medium text-md-on-surface-variant uppercase tracking-wide mb-2">{t('ledger.expenses')}</p>}
      <div className="space-y-2 mb-4">
        {expenses.map((row) => (
          <div key={row.pk} className="budget-progress-card ripple-item" onClick={() => onExpense(row.pk)}>
            <div className="icon-circle" style={{ background: `${row.style?.color}22`, color: row.style?.color }}><span className="material-icons-round">{row.style?.icon}</span></div>
            <div className="budget-progress-card__body">
              <div className="budget-progress-card__top"><p className="budget-progress-card__title">{row.title}</p><p className="budget-progress-card__amount amount-expense">−{m(row.planned)}</p></div>
              <div className="budget-progress"><div className="budget-progress__track"><div className={`budget-progress__fill ${row.is_over ? 'budget-progress__fill--over' : 'budget-progress__fill--expense'}`} style={{ width: `${row.progress_pct}%` }} /></div><span className="budget-progress__label">{row.progress_pct}%</span></div>
            </div>
          </div>
        ))}
      </div>
      {incomes.length > 0 && <p className="text-xs font-medium text-md-on-surface-variant uppercase tracking-wide mb-2">{t('home.income')}</p>}
      <div className="space-y-2">
        {incomes.map((row) => (
          <div key={row.pk} className="budget-progress-card ripple-item" onClick={() => onIncome(row.pk)}>
            <div className="icon-circle icon-circle--income"><span className="material-icons-round">payments</span></div>
            <div className="budget-progress-card__body">
              <div className="budget-progress-card__top"><p className="budget-progress-card__title">{row.title}</p><p className="budget-progress-card__amount amount-income">+{m(row.planned)}</p></div>
              <div className="budget-progress"><div className="budget-progress__track"><div className="budget-progress__fill budget-progress__fill--income" style={{ width: `${row.progress_pct}%` }} /></div><span className="budget-progress__label">{row.progress_pct}%</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountSelect({ data, value, onChange }: { data: BootstrapData; value: number; onChange: (v: number) => void }) {
  const { t } = useT();
  return (
    <div className="form-field">
      <label className="form-field__label">{t('form.account')}</label>
      <select className="md-select" value={value} onChange={(e) => onChange(Number(e.target.value))} required>
        {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.type_label}</option>)}
      </select>
    </div>
  );
}

function DailyAddForm({ data, addType, setAddType, onSubmit, onClose }: { data: BootstrapData; addType: 'expense' | 'income'; setAddType: (t: 'expense' | 'income') => void; onSubmit: (b: unknown) => void; onClose: () => void }) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [dt, setDt] = useState(toDatetimeLocalValue(new Date()));
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);
  const [memo, setMemo] = useState('');

  return (
    <form className="form-sheet" onSubmit={(e) => { e.preventDefault(); onSubmit({ transaction_type: addType, category_name: category, amount, txn_datetime: dt, account: accountId, memo }); }}>
      <div className="add-type-tabs">
        <button type="button" className={`add-type-tab ${addType === 'expense' ? 'add-type-tab--active' : ''}`} onClick={() => setAddType('expense')}><span className="material-icons-round text-base">north_east</span>{t('home.expense')}</button>
        <button type="button" className={`add-type-tab ${addType === 'income' ? 'add-type-tab--active' : ''}`} onClick={() => setAddType('income')}><span className="material-icons-round text-base">south_west</span>{t('home.income')}</button>
      </div>
      <div className="form-section">
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.amount')}</label><input className="md-input" type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.category')}</label><input className="md-input" required value={category} onChange={(e) => setCategory(e.target.value)} list="cat-suggestions" /><datalist id="cat-suggestions">{(addType === 'expense' ? data.expense_suggestions : data.income_suggestions).map((s) => <option key={s} value={s} />)}</datalist></div>
      </div>
      <div className="form-section">
        <div className="form-field"><label className="form-field__label">{t('form.dateTime')}</label><input className="md-input" type="datetime-local" required value={dt} onChange={(e) => setDt(e.target.value)} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
        <div className="form-field"><label className="form-field__label">{t('form.memo')}</label><input className="md-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('form.memoPlaceholder')} /></div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        <button type="submit" className="btn-primary">{addType === 'expense' ? t('form.saveExpense') : t('form.saveIncome')}</button>
      </div>
    </form>
  );
}

function BudgetAddForm({ data, addType, setAddType, onIncome, onExpense, onClose }: { data: BootstrapData; addType: 'expense' | 'income'; setAddType: (t: 'expense' | 'income') => void; onIncome: (b: unknown) => void; onExpense: (b: unknown) => void; onClose: () => void }) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);
  const [recordToday, setRecordToday] = useState(true);

  return (
    <form className="form-sheet" onSubmit={(e) => {
      e.preventDefault();
      const body = { account: accountId, year: data.month_year, month: data.month_num };
      if (addType === 'income') onIncome({ ...body, source_name: name, amount, record_today: recordToday });
      else onExpense({ ...body, category_name: name, budgeted_amount: amount });
    }}>
      <div className="add-type-tabs">
        <button type="button" className={`add-type-tab ${addType === 'expense' ? 'add-type-tab--active' : ''}`} onClick={() => setAddType('expense')}>{t('home.expense')}</button>
        <button type="button" className={`add-type-tab ${addType === 'income' ? 'add-type-tab--active' : ''}`} onClick={() => setAddType('income')}>{t('home.income')}</button>
      </div>
      <div className="form-section">
        <div className="form-field form-field--amount"><label className="form-field__label">{addType === 'income' ? t('form.amount') : t('form.budgetedAmount')}</label><input className="md-input" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{addType === 'income' ? t('form.source') : t('form.category')}</label><input className="md-input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
      </div>
      {addType === 'income' && (
        <div className="form-section form-section--soft">
          <div className="form-toggle-row">
            <div className="form-toggle-row__text"><p className="form-toggle-row__title">{t('form.recordInDaily')}</p></div>
            <label className="md-toggle"><input type="checkbox" className="md-toggle-input" checked={recordToday} onChange={(e) => setRecordToday(e.target.checked)} /><div className="md-toggle-track"><div className="md-toggle-thumb" /></div></label>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        <button type="submit" className="btn-primary">{addType === 'income' ? t('form.addIncome') : t('form.addExpense')}</button>
      </div>
    </form>
  );
}

function AccountForm({ account, onSubmit, onDelete, onClose }: { account?: BootstrapData['accounts'][0]; onSubmit: (b: unknown) => void; onDelete?: () => void; onClose: () => void }) {
  const { lang, t } = useT();
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState(account?.account_type || 'cash');
  const [initialBalance, setInitialBalance] = useState(String(account?.initial_balance ?? '0'));
  const includeInTotal = account?.include_in_total ?? true;
  const isDefault = account?.is_default ?? false;

  return (
    <form className="form-sheet" onSubmit={(e) => { e.preventDefault(); onSubmit({ name, account_type: accountType, initial_balance: initialBalance, include_in_total: includeInTotal, is_default: isDefault }); }}>
      <div className="form-sheet__head"><h3 className="form-sheet__title">{account ? t('form.editAccount') : t('form.newAccount')}</h3></div>
      <div className="form-section">
        <div className="form-field"><label className="form-field__label">{t('form.accountName')}</label><input className="md-input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.type')}</label><select className="md-select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>{accountTypeChoices(lang).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.initialBalance')}</label><input className="md-input" type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} /></div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        {onDelete && <button type="button" className="form-actions__btn form-actions__icon form-actions__btn--danger" onClick={onDelete}><span className="material-icons-round">delete</span></button>}
        <button type="submit" className="btn-primary">{account ? t('common.save') : t('form.createAccount')}</button>
      </div>
    </form>
  );
}

function TxEditForm({ data, id, onSubmit, onDelete, onClose }: { data: BootstrapData; id: number; onSubmit: (b: unknown) => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useT();
  const entry = data.ledger_entries.find((e) => e.pk === id && e.source === 'daily') || data.recent_activity.find((e) => e.pk === id);
  const [amount, setAmount] = useState(String(entry?.amount ?? ''));
  const [category, setCategory] = useState(entry?.title ?? '');
  const [dt, setDt] = useState(toDatetimeLocalValue(new Date()));
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);
  const [memo, setMemo] = useState('');

  useEffect(() => {
    fetch(`/api/transactions/${id}`).then((r) => r.json()).then((tx) => {
      setAmount(String(tx.amount));
      setCategory(tx.categoryName);
      setDt(toDatetimeLocalValue(new Date(tx.transactionDate)));
      setAccountId(tx.accountId);
      setMemo(tx.memo || '');
    });
  }, [id]);

  return (
    <form className="form-sheet" onSubmit={(e) => { e.preventDefault(); onSubmit({ transaction_type: entry?.kind || 'expense', category_name: category, amount, txn_datetime: dt, account: accountId, memo }); }}>
      <div className="form-sheet__head"><h3 className="form-sheet__title">{t('form.editTransaction')}</h3></div>
      <div className="form-section">
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.amount')}</label><input className="md-input" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.category')}</label><input className="md-input" required value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.dateTime')}</label><input className="md-input" type="datetime-local" required value={dt} onChange={(e) => setDt(e.target.value)} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
        <div className="form-field"><label className="form-field__label">{t('form.memo')}</label><input className="md-input" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        <button type="button" className="form-actions__btn form-actions__icon form-actions__btn--danger" onClick={onDelete}><span className="material-icons-round">delete</span></button>
        <button type="submit" className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}

function IncomeEditForm({ data, id, onSubmit, onDelete, onClose }: { data: BootstrapData; id: number; onSubmit: (b: unknown) => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useT();
  const inc = data.incomes.find((i) => i.id === id);
  const [name, setName] = useState(inc?.source_name || '');
  const [amount, setAmount] = useState(String(inc?.amount ?? ''));
  const [accountId, setAccountId] = useState(inc?.account_id || data.default_account_id || 0);
  return (
    <form className="form-sheet" onSubmit={(e) => { e.preventDefault(); onSubmit({ source_name: name, amount, account: accountId }); }}>
      <div className="form-sheet__head"><h3 className="form-sheet__title">{t('form.editIncome')}</h3></div>
      <div className="form-section">
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.amount')}</label><input className="md-input" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.source')}</label><input className="md-input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        <button type="button" className="form-actions__btn form-actions__icon form-actions__btn--danger" onClick={onDelete}><span className="material-icons-round">delete</span></button>
        <button type="submit" className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}

function ExpenseEditForm({ data, id, onSubmit, onDelete, onClose }: { data: BootstrapData; id: number; onSubmit: (b: unknown) => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useT();
  const exp = data.expenses.find((e) => e.id === id);
  const [name, setName] = useState(exp?.category_name || '');
  const [amount, setAmount] = useState(String(exp?.budgeted_amount ?? ''));
  const [accountId, setAccountId] = useState(exp?.account_id || data.default_account_id || 0);
  const [isPaid, setIsPaid] = useState(exp?.is_paid || false);
  return (
    <form className="form-sheet" onSubmit={(e) => { e.preventDefault(); onSubmit({ category_name: name, budgeted_amount: amount, account: accountId, is_paid: isPaid }); }}>
      <div className="form-sheet__head"><h3 className="form-sheet__title">{t('form.editExpense')}</h3></div>
      <div className="form-section">
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.budgetedAmount')}</label><input className="md-input" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.category')}</label><input className="md-input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
      </div>
      <div className="form-section form-section--soft">
        <div className="form-toggle-row">
          <div className="form-toggle-row__text"><p className="form-toggle-row__title">{t('form.markAsPaid')}</p></div>
          <label className="md-toggle"><input type="checkbox" className="md-toggle-input" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /><div className="md-toggle-track"><div className="md-toggle-thumb" /></div></label>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        <button type="button" className="form-actions__btn form-actions__icon form-actions__btn--danger" onClick={onDelete}><span className="material-icons-round">delete</span></button>
        <button type="submit" className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}

function SettingsForm({ data, onSave }: { data: BootstrapData; onSave: (b: unknown) => void }) {
  const s = data.settings;
  const { t, setLang, lang } = useT();
  return (
    <form className="form-sheet" onChange={(e) => {
      const form = e.currentTarget;
      const fd = new FormData(form);
      const nextLang = parseLanguage(fd.get('language'), lang);
      setLang(nextLang);
      onSave({
        display_name: fd.get('display_name'),
        currency_code: fd.get('currency_code'),
        currency_position: fd.get('currency_position'),
        theme: fd.get('theme'),
        language: nextLang,
        app_mode: fd.get('app_mode'),
        show_zero_balance_badge: fd.get('show_zero_balance_badge') === 'on',
      });
    }}>
      <div className="form-section">
        <p className="form-field__label">{t('settings.profile')}</p>
        <div className="form-field"><label className="form-field__label">{t('settings.displayName')}</label><input className="md-input" name="display_name" defaultValue={s.displayName} /></div>
      </div>
      <div className="form-section">
        <p className="form-field__label">{t('settings.language')}</p>
        <div className="settings-pill-track">
          {LANGUAGES.map((code) => (
            <label key={code} className="cursor-pointer">
              <input
                type="radio"
                name="language"
                value={code}
                className="sr-only"
                defaultChecked={parseLanguage(s.language, 'en') === code}
              />
              <span className="settings-option">{LANGUAGE_LABELS[code]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="form-section">
        <p className="form-field__label">{t('settings.currency')}</p>
        <div className="form-field"><label className="form-field__label">{t('settings.selectCurrency')}</label>
          <select className="md-select" name="currency_code" defaultValue={s.currencyCode}>{CURRENCY_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </div>
        <div className="settings-pill-track">
          <label className="cursor-pointer"><input type="radio" name="currency_position" value="before" className="sr-only" defaultChecked={s.currencyPosition === 'before'} /><span className="settings-option">{t('settings.before')}</span></label>
          <label className="cursor-pointer"><input type="radio" name="currency_position" value="after" className="sr-only" defaultChecked={s.currencyPosition === 'after'} /><span className="settings-option">{t('settings.after')}</span></label>
        </div>
      </div>
      <div className="form-section">
        <p className="form-field__label">{t('settings.appearance')}</p>
        <div className="settings-pill-track">
          <label className="cursor-pointer"><input type="radio" name="app_mode" value="daily" className="sr-only" defaultChecked={s.appMode === 'daily'} /><span className="settings-option">{t('settings.daily')}</span></label>
          <label className="cursor-pointer"><input type="radio" name="app_mode" value="monthly" className="sr-only" defaultChecked={s.appMode === 'monthly'} /><span className="settings-option">{t('settings.monthly')}</span></label>
        </div>
        <div className="settings-pill-track mt-3">
          <label className="cursor-pointer"><input type="radio" name="theme" value="light" className="sr-only" defaultChecked={s.theme !== 'dark'} /><span className="settings-option">{t('settings.light')}</span></label>
          <label className="cursor-pointer"><input type="radio" name="theme" value="dark" className="sr-only" defaultChecked={s.theme === 'dark'} /><span className="settings-option">{t('settings.dark')}</span></label>
        </div>
      </div>
      <div className="form-section form-section--soft">
        <div className="form-toggle-row">
          <div className="form-toggle-row__text"><p className="form-toggle-row__title">{t('settings.zeroBadge')}</p></div>
          <label className="md-toggle"><input type="checkbox" name="show_zero_balance_badge" className="md-toggle-input" defaultChecked={s.showZeroBalanceBadge} /><div className="md-toggle-track"><div className="md-toggle-thumb" /></div></label>
        </div>
      </div>
    </form>
  );
}

function TransferForm({
  data,
  onSubmit,
  onClose,
}: {
  data: BootstrapData;
  onSubmit: (b: unknown) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState(data.default_account_id || data.accounts[0]?.id || 0);
  const [toId, setToId] = useState(data.accounts.find((a) => a.id !== (data.default_account_id || data.accounts[0]?.id))?.id || data.accounts[1]?.id || 0);
  const [dt, setDt] = useState(toDatetimeLocalValue(new Date()));
  const [memo, setMemo] = useState('');

  return (
    <form
      className="form-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ from_account: fromId, to_account: toId, amount, txn_datetime: dt, memo, category_name: 'Transfer' });
      }}
    >
      <div className="form-sheet__head">
        <h2 className="form-sheet__title">{t('form.transfer')}</h2>
        <p className="form-sheet__sub">{t('form.transferSub')}</p>
      </div>
      <div className="form-section">
        <div className="form-field form-field--amount">
          <label className="form-field__label">{t('form.amount')}</label>
          <input className="md-input" type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.from')}</label>
          <select className="md-select" value={fromId} onChange={(e) => setFromId(Number(e.target.value))} required>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.to')}</label>
          <select className="md-select" value={toId} onChange={(e) => setToId(Number(e.target.value))} required>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.dateTime')}</label>
          <input className="md-input" type="datetime-local" required value={dt} onChange={(e) => setDt(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.memo')}</label>
          <input className="md-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('form.memoOptional')} />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
        <button type="submit" className="btn-primary">{t('form.transfer')}</button>
      </div>
    </form>
  );
}

function RecurringForm({
  data,
  onCreate,
  onToggle,
  onDelete,
  onClose,
}: {
  data: BootstrapData;
  onCreate: (b: unknown) => void;
  onToggle: (id: number, is_active: boolean) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [frequency, setFrequency] = useState('monthly');
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);

  const freqLabel = (f: string) =>
    f === 'daily' ? t('form.freqDaily') : f === 'weekly' ? t('form.freqWeekly') : t('form.freqMonthly');

  return (
    <div className="form-sheet">
      <div className="form-sheet__head">
        <h2 className="form-sheet__title">{t('form.recurring')}</h2>
        <p className="form-sheet__sub">{t('form.recurringSub')}</p>
      </div>
      {(data.recurring_rules?.length ?? 0) > 0 && (
        <div className="form-section space-y-2">
          {(data.recurring_rules ?? []).map((r) => (
            <div key={r.id} className="recurring-row">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.category_name}</p>
                <p className="text-xs text-md-on-surface-variant">{freqLabel(r.frequency)} · {r.account_name} · {r.is_active ? t('form.on') : t('form.paused')}</p>
              </div>
              <button type="button" className="section-icon-btn" onClick={() => onToggle(r.id, !r.is_active)} aria-label="Toggle">
                <span className="material-icons-round">{r.is_active ? 'pause' : 'play_arrow'}</span>
              </button>
              <button type="button" className="section-icon-btn" onClick={() => onDelete(r.id)} aria-label={t('common.delete')}>
                <span className="material-icons-round">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="form-section"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate({
            transaction_type: type,
            category_name: category,
            amount,
            account: accountId,
            frequency,
            next_run_at: new Date().toISOString(),
          });
          setAmount('');
          setCategory('');
        }}
      >
        <p className="form-field__label mb-2">{t('form.addRule')}</p>
        <div className="add-type-tabs mb-3">
          <button type="button" className={`add-type-tab ${type === 'expense' ? 'add-type-tab--active' : ''}`} onClick={() => setType('expense')}>{t('home.expense')}</button>
          <button type="button" className={`add-type-tab ${type === 'income' ? 'add-type-tab--active' : ''}`} onClick={() => setType('income')}>{t('home.income')}</button>
        </div>
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.amount')}</label><input className="md-input" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.name')}</label><input className="md-input" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('form.namePlaceholder')} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
        <div className="form-field">
          <label className="form-field__label">{t('form.frequency')}</label>
          <select className="md-select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">{t('form.freqDaily')}</option>
            <option value="weekly">{t('form.freqWeekly')}</option>
            <option value="monthly">{t('form.freqMonthly')}</option>
          </select>
        </div>
        <div className="form-actions mt-3">
          <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
          <button type="submit" className="btn-primary">{t('form.saveRule')}</button>
        </div>
      </form>
    </div>
  );
}

function TemplatesForm({
  data,
  onCreate,
  onDelete,
  onClose,
}: {
  data: BootstrapData;
  onCreate: (b: unknown) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);

  return (
    <div className="form-sheet">
      <div className="form-sheet__head">
        <h2 className="form-sheet__title">{t('form.templates')}</h2>
        <p className="form-sheet__sub">{t('form.templatesSub')}</p>
      </div>
      {(data.quick_templates?.length ?? 0) > 0 && (
        <div className="form-section flex flex-wrap gap-2">
          {(data.quick_templates ?? []).map((tpl) => (
            <button key={tpl.id} type="button" className="template-chip template-chip--manage" onClick={() => onDelete(tpl.id)}>
              <span>{tpl.label}</span>
              <span className="material-icons-round text-sm">close</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="form-section"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate({
            label: label || category,
            transaction_type: type,
            category_name: category || label,
            amount: amount || 0,
            account: accountId,
          });
          setLabel('');
          setAmount('');
          setCategory('');
        }}
      >
        <p className="form-field__label mb-2">{t('form.newTemplate')}</p>
        <div className="add-type-tabs mb-3">
          <button type="button" className={`add-type-tab ${type === 'expense' ? 'add-type-tab--active' : ''}`} onClick={() => setType('expense')}>{t('home.expense')}</button>
          <button type="button" className={`add-type-tab ${type === 'income' ? 'add-type-tab--active' : ''}`} onClick={() => setType('income')}>{t('home.income')}</button>
        </div>
        <div className="form-field"><label className="form-field__label">{t('form.label')}</label><input className="md-input" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('form.labelPlaceholder')} /></div>
        <div className="form-field"><label className="form-field__label">{t('form.category')}</label><input className="md-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('form.categoryPlaceholder')} /></div>
        <div className="form-field form-field--amount"><label className="form-field__label">{t('form.defaultAmount')}</label><input className="md-input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <AccountSelect data={data} value={accountId} onChange={setAccountId} />
        <div className="form-actions mt-3">
          <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}><span className="material-icons-round">close</span></button>
          <button type="submit" className="btn-primary">{t('form.saveTemplate')}</button>
        </div>
      </form>
    </div>
  );
}

