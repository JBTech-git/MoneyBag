import type { BootstrapData } from '@/lib/types';

export type InsightTip = {
  id: string;
  tone: 'ok' | 'warn' | 'info';
  title: string;
  body: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

type InsightContext = {
  insights?: BootstrapData['insights'];
  total_planned: number;
  actual_spent: number;
  budget_remaining: number;
  day_expense?: number;
  day_income?: number;
  money: (n: number) => string;
};

/** Rule-based tips from bootstrap numbers (no API key required). */
export function buildSmartTips(ctx: InsightContext): InsightTip[] {
  const tips: InsightTip[] = [];
  const ins = ctx.insights;
  const spent = ins?.month_spent ?? ctx.actual_spent;
  const income = ins?.month_income ?? 0;
  const planned = ctx.total_planned;
  const remaining = ctx.budget_remaining;
  const top = ins?.top_categories?.[0];
  const week = ins?.week_spent ?? 0;

  if (planned > 0 && remaining < 0) {
    tips.push({
      id: 'over-budget',
      tone: 'warn',
      title: 'You are over budget',
      body: `Spending has exceeded your plan by ${ctx.money(Math.abs(remaining))}. Top category: ${top?.name || '—'}.`,
    });
  } else if (planned > 0 && (ins?.budget_used_pct ?? 0) >= 80) {
    tips.push({
      id: 'budget-tight',
      tone: 'warn',
      title: 'Budget nearly used',
      body: `${ins?.budget_used_pct}% of your monthly budget is used. About ${ctx.money(Math.max(0, remaining))} left.`,
    });
  } else if (planned > 0 && remaining > 0) {
    tips.push({
      id: 'on-track',
      tone: 'ok',
      title: 'On track this month',
      body: `${ctx.money(remaining)} left in your budget plan.`,
    });
  }

  if (top && spent > 0) {
    tips.push({
      id: 'top-cat',
      tone: 'info',
      title: `Biggest spend: ${top.name}`,
      body: `${ctx.money(top.amount)} (${top.pct}% of month expenses). Ask “why did I overspend?” for detail.`,
    });
  }

  if (week > 0 && spent > 0 && week >= spent * 0.45) {
    tips.push({
      id: 'week-heavy',
      tone: 'warn',
      title: 'Heavy last 7 days',
      body: `You spent ${ctx.money(week)} in the last week — a large share of this month’s ${ctx.money(spent)}.`,
    });
  }

  if (income > 0 && spent > income) {
    tips.push({
      id: 'spend-gt-income',
      tone: 'warn',
      title: 'Spending above income',
      body: `Month expenses ${ctx.money(spent)} vs income ${ctx.money(income)}. Net is ${ctx.money(income - spent)}.`,
    });
  }

  if (!tips.length) {
    tips.push({
      id: 'start',
      tone: 'info',
      title: 'Add a few transactions',
      body: 'Once you log spending, Moneybag can explain overspending and suggest focus areas.',
    });
  }

  return tips.slice(0, 4);
}

function normalizeQuestion(q: string) {
  return q.trim().toLowerCase();
}

/** Local “chat” answers grounded in the user’s bootstrap snapshot. */
export function answerInsightQuestion(question: string, ctx: InsightContext): string {
  const q = normalizeQuestion(question);
  const ins = ctx.insights;
  const spent = ins?.month_spent ?? ctx.actual_spent;
  const income = ins?.month_income ?? 0;
  const planned = ctx.total_planned;
  const remaining = ctx.budget_remaining;
  const cats = ins?.top_categories ?? [];
  const top = cats[0];
  const week = ins?.week_spent ?? 0;

  if (!q) {
    return 'Ask something like “why did I overspend?” or “where is my money going?”';
  }

  if (/(overspend|over spent|over-budget|over budget|why.*(spend|spent)|too much)/.test(q)) {
    if (planned > 0 && remaining < 0) {
      const catLine = top
        ? ` Your largest category is ${top.name} at ${ctx.money(top.amount)} (${top.pct}%).`
        : '';
      return `You are over budget by ${ctx.money(Math.abs(remaining))} this month (spent ${ctx.money(spent)} vs plan ${ctx.money(planned)}).${catLine} Try trimming that category or raising its envelope.`;
    }
    if (planned > 0 && (ins?.budget_used_pct ?? 0) >= 70) {
      return `You have used ${ins?.budget_used_pct}% of the budget with ${ctx.money(Math.max(0, remaining))} left. Last 7 days: ${ctx.money(week)}. Pace spending for the rest of the month.`;
    }
    if (income > 0 && spent > income) {
      return `Expenses (${ctx.money(spent)}) are higher than income (${ctx.money(income)}) this month. Net: ${ctx.money(income - spent)}.`;
    }
    if (top) {
      return `You are not clearly over a set budget, but ${top.name} is your largest spend at ${ctx.money(top.amount)}. That is the first place to review.`;
    }
    return 'There is not enough budget/spending data yet to explain overspending. Add a monthly plan and a few expenses.';
  }

  if (/(where|going|top|categor|biggest|most)/.test(q)) {
    if (!cats.length) {
      return 'No expense categories yet this month. Log a few transactions and ask again.';
    }
    const lines = cats
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${c.name}: ${ctx.money(c.amount)} (${c.pct}%)`)
      .join('\n');
    return `Top spending this month:\n${lines}`;
  }

  if (/(save|saving|goal)/.test(q)) {
    return remaining > 0
      ? `You still have ${ctx.money(remaining)} unspent vs your budget plan — that could go toward a savings goal.`
      : `Budget headroom is tight (${ctx.money(remaining)} remaining). Pause non-essentials before adding to goals.`;
  }

  if (/(week|7 day|last week)/.test(q)) {
    return `Last 7 days spending: ${ctx.money(week)}. Month so far: ${ctx.money(spent)}.`;
  }

  if (/(income|earn|salary)/.test(q)) {
    return `Month income: ${ctx.money(income)}. Month expenses: ${ctx.money(spent)}. Net: ${ctx.money(income - spent)}.`;
  }

  if (/(help|tip|advice|what should)/.test(q)) {
    const tips = buildSmartTips(ctx);
    return tips.map((t) => `• ${t.title}: ${t.body}`).join('\n');
  }

  // Default summary
  const catBit = top ? ` Biggest category: ${top.name} (${ctx.money(top.amount)}).` : '';
  return `This month: spent ${ctx.money(spent)}, income ${ctx.money(income)}, budget left ${ctx.money(remaining)}.${catBit} Try asking “why did I overspend?” or “where is my money going?”`;
}
