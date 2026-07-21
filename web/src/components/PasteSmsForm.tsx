'use client';

import { useState } from 'react';
import { useT } from '@/components/I18nProvider';
import { toDatetimeLocalValue } from '@/lib/dates';
import { parseSmsOrUpiText } from '@/lib/smsParse';
import type { BootstrapData } from '@/lib/types';

export default function PasteSmsForm({
  data,
  onSubmit,
  onClose,
}: {
  data: BootstrapData;
  onSubmit: (b: unknown) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [raw, setRaw] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [memo, setMemo] = useState('');
  const [addType, setAddType] = useState<'expense' | 'income'>('expense');
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [dt, setDt] = useState(toDatetimeLocalValue(new Date()));

  const parse = () => {
    const parsed = parseSmsOrUpiText(raw);
    if (parsed.amount != null) setAmount(String(parsed.amount));
    setCategory(parsed.categoryName);
    setMemo(parsed.memo);
    setAddType(parsed.transactionType);
    setConfidence(parsed.confidence);
  };

  return (
    <form
      className="form-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          transaction_type: addType,
          category_name: category,
          amount,
          txn_datetime: dt,
          account: accountId,
          memo,
        });
      }}
    >
      <div className="form-sheet__head">
        <h3 className="form-sheet__title">{t('more.pasteSms')}</h3>
        <p className="text-sm text-md-on-surface-variant">{t('form.pasteSmsHint')}</p>
      </div>
      <div className="form-section">
        <div className="form-field">
          <label className="form-field__label">{t('form.pasteSms')}</label>
          <textarea
            className="md-input md-input--area"
            rows={4}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Rs.500 debited from A/c ... UPI ..."
          />
        </div>
        <button type="button" className="btn-primary w-full" onClick={parse} disabled={!raw.trim()} style={{ opacity: raw.trim() ? 1 : 0.5 }}>
          {t('form.parseSms')}
        </button>
        {confidence && (
          <p className="text-xs text-md-on-surface-variant mt-2">
            {t('form.smsConfidence', { level: confidence })}
          </p>
        )}
      </div>
      <div className="add-type-tabs">
        <button type="button" className={`add-type-tab ${addType === 'expense' ? 'add-type-tab--active' : ''}`} onClick={() => setAddType('expense')}>{t('home.expense')}</button>
        <button type="button" className={`add-type-tab ${addType === 'income' ? 'add-type-tab--active' : ''}`} onClick={() => setAddType('income')}>{t('home.income')}</button>
      </div>
      <div className="form-section">
        <div className="form-field form-field--amount">
          <label className="form-field__label">{t('form.amount')}</label>
          <input className="md-input" type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.category')}</label>
          <input className="md-input" required value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.dateTime')}</label>
          <input className="md-input" type="datetime-local" required value={dt} onChange={(e) => setDt(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.account')}</label>
          <select className="md-select" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} required>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.memo')}</label>
          <input className="md-input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}>
          <span className="material-icons-round">close</span>
        </button>
        <button type="submit" className="btn-primary" disabled={!amount || !category}>
          {addType === 'expense' ? t('form.saveExpense') : t('form.saveIncome')}
        </button>
      </div>
    </form>
  );
}
