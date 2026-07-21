'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/components/I18nProvider';
import { buildSmartTips } from '@/lib/insightsEngine';
import type { BootstrapData } from '@/lib/types';

export default function InsightsChat({
  data,
  m,
  onClose,
}: {
  data: BootstrapData;
  m: (n: number) => string;
  onClose: () => void;
}) {
  const { t } = useT();
  const ctx = useMemo(
    () => ({
      insights: data.insights,
      total_planned: data.total_planned,
      actual_spent: data.actual_spent,
      budget_remaining: data.budget_remaining,
      day_expense: data.day_expense,
      day_income: data.day_income,
      money: m,
    }),
    [data, m],
  );

  const tips = useMemo(() => buildSmartTips(ctx), [ctx]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: t('insights.welcomeAi'),
    },
  ]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    const history = messages.slice(-8);
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/insights/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t('insights.error'));
      }
      const answer = String(json.answer || t('insights.error'));
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err instanceof Error ? err.message : t('insights.error'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    t('insights.qOverspend'),
    t('insights.qWhere'),
    t('insights.qWeek'),
  ];

  return (
    <div className="form-sheet insights-chat">
      <div className="form-sheet__head">
        <h3 className="form-sheet__title">{t('more.insights')}</h3>
        <p className="text-sm text-md-on-surface-variant">{t('more.insightsDesc')}</p>
      </div>

      <div className="insights-tips">
        {tips.map((tip) => (
          <div key={tip.id} className={`insights-tip insights-tip--${tip.tone}`}>
            <p className="insights-tip__title">{tip.title}</p>
            <p className="insights-tip__body">{tip.body}</p>
          </div>
        ))}
      </div>

      <div className="insights-suggestions">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="category-chip"
            disabled={loading}
            onClick={() => ask(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="insights-messages">
        {messages.map((msg, i) => (
          <div key={`${msg.role}-${i}`} className={`insights-msg insights-msg--${msg.role}`}>
            <p>{msg.text}</p>
          </div>
        ))}
        {loading && (
          <div className="insights-msg insights-msg--assistant">
            <p>{t('insights.thinking')}</p>
          </div>
        )}
      </div>

      <form
        className="insights-compose"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          className="md-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('insights.placeholder')}
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={!input.trim() || loading}>
          {loading ? t('insights.thinkingShort') : t('insights.ask')}
        </button>
      </form>

      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}>
          <span className="material-icons-round">close</span>
        </button>
      </div>
    </div>
  );
}
