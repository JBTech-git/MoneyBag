import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/auth';
import {
  askGeminiAboutSubscriberFinance,
  isGeminiConfigured,
  isGeminiQuotaError,
} from '@/lib/gemini';
import { buildSubscriberFinanceSnapshot } from '@/lib/userFinanceSnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function localAnswerFromSnapshot(
  question: string,
  snapshot: Awaited<ReturnType<typeof buildSubscriberFinanceSnapshot>>,
) {
  const q = question.toLowerCase();
  const top = snapshot.top_expense_categories[0];
  const s = snapshot.summary;

  if (/(overspend|over spent|over-budget|over budget|why.*(spend|spent)|too much|জ্যাদা|বেশি)/i.test(q)) {
    if (s.budget_used_pct >= 100) {
      return `Based on your Moneybag data for ${snapshot.period.label}: you are over plan (budget used ${s.budget_used_pct}%). Spent ${s.month_expense} vs planned ${s.budget_planned_expense}. Remaining vs plan: ${s.budget_remaining_vs_plan}.${top ? ` Biggest category: ${top.name} (${top.amount}, ${top.pct}%).` : ''}`;
    }
    if (s.budget_used_pct >= 70) {
      return `Your budget is ${s.budget_used_pct}% used this month. Spent ${s.month_expense}, left vs plan ${s.budget_remaining_vs_plan}. Last 7 days: ${s.week_expense}.${top ? ` Watch ${top.name}.` : ''}`;
    }
    return `You are not clearly over budget (${s.budget_used_pct}% used). Month spend ${s.month_expense}, income ${s.month_income}.${top ? ` Largest spend is ${top.name} at ${top.amount}.` : ''}`;
  }

  if (/(where|going|top|categor|biggest|most)/i.test(q)) {
    if (!snapshot.top_expense_categories.length) {
      return 'No expense categories logged this month yet. Add a few transactions and ask again.';
    }
    return `Top spending for ${snapshot.period.label}:\n${snapshot.top_expense_categories
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${c.name}: ${c.amount} (${c.pct}%)`)
      .join('\n')}`;
  }

  if (/(week|7 day|last week)/i.test(q)) {
    return `Last 7 days: ${s.week_expense}. Month so far: ${s.month_expense} spent, ${s.month_income} income.`;
  }

  return `For ${snapshot.period.label}: spent ${s.month_expense}, income ${s.month_income}, net ${s.month_net}, budget left vs plan ${s.budget_remaining_vs_plan}.${top ? ` Top category: ${top.name} (${top.amount}).` : ''}`;
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({
      ok: true,
      configured: isGeminiConfigured(),
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const question = String(body.message || body.question || '').trim();
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (h: { role?: string; text?: string }) =>
              (h?.role === 'user' || h?.role === 'assistant') && typeof h?.text === 'string',
          )
          .map((h: { role: 'user' | 'assistant'; text: string }) => ({
            role: h.role,
            text: String(h.text).slice(0, 2000),
          }))
          .slice(-8)
      : [];

    const snapshot = await buildSubscriberFinanceSnapshot(user.id);

    if (!isGeminiConfigured()) {
      return NextResponse.json({
        ok: true,
        provider: 'local',
        answer: localAnswerFromSnapshot(question, snapshot),
        subscriber: snapshot.subscriber.display_name,
        period: snapshot.period.label,
      });
    }

    try {
      const result = await askGeminiAboutSubscriberFinance({
        question,
        snapshotJson: JSON.stringify(snapshot),
        history,
        language: snapshot.subscriber.language,
      });
      return NextResponse.json({
        ok: true,
        provider: 'insights',
        answer: result.answer,
        subscriber: snapshot.subscriber.display_name,
        period: snapshot.period.label,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Insights unavailable';
      const local = localAnswerFromSnapshot(question, snapshot);
      if (isGeminiQuotaError(message)) {
        return NextResponse.json({
          ok: true,
          provider: 'local',
          answer: `${local}\n\n(Insights is busy right now — answered from your Moneybag data. Please try again shortly.)`,
          subscriber: snapshot.subscriber.display_name,
          period: snapshot.period.label,
        });
      }
      return NextResponse.json({
        ok: true,
        provider: 'local',
        answer: `${local}\n\n(Insights temporarily unavailable — answered from your Moneybag data.)`,
        subscriber: snapshot.subscriber.display_name,
        period: snapshot.period.label,
      });
    }
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json(
      { error: 'Could not get an insights answer. Please try again.' },
      { status: 500 },
    );
  }
}
