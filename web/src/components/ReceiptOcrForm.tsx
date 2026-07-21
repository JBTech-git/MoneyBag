'use client';

import { useRef, useState } from 'react';
import { useT } from '@/components/I18nProvider';
import { toDatetimeLocalValue } from '@/lib/dates';
import { parseReceiptText } from '@/lib/receiptParse';
import type { BootstrapData } from '@/lib/types';

export default function ReceiptOcrForm({
  data,
  onSubmit,
  onClose,
}: {
  data: BootstrapData;
  onSubmit: (b: unknown) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [memo, setMemo] = useState('');
  const [accountId, setAccountId] = useState(data.default_account_id || data.accounts[0]?.id || 0);
  const [dt, setDt] = useState(toDatetimeLocalValue(new Date()));

  const applyParsed = (text: string) => {
    const parsed = parseReceiptText(text);
    setRawText(text);
    if (parsed.amount != null) setAmount(String(parsed.amount));
    setCategory(parsed.categoryName);
    setMemo(parsed.memo);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError(t('receipt.needImage'));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError(t('receipt.tooLarge'));
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    setScanning(true);
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const result = await Tesseract.recognize(file, 'eng', {
        logger: () => undefined,
      });
      applyParsed(result.data.text || '');
    } catch {
      setError(t('receipt.ocrFailed'));
    } finally {
      setScanning(false);
    }
  };

  return (
    <form
      className="form-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          transaction_type: 'expense',
          category_name: category,
          amount,
          txn_datetime: dt,
          account: accountId,
          memo: memo || rawText.slice(0, 160),
        });
      }}
    >
      <div className="form-sheet__head">
        <h3 className="form-sheet__title">{t('more.receipt')}</h3>
        <p className="text-sm text-md-on-surface-variant">{t('more.receiptDesc')}</p>
      </div>

      <div className="form-section">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          className="receipt-upload-btn"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
        >
          <span className="material-icons-round">{scanning ? 'hourglass_top' : 'photo_camera'}</span>
          <span>{scanning ? t('receipt.scanning') : t('receipt.pickPhoto')}</span>
        </button>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="receipt-preview" />
        )}
        {error && <p className="text-sm amount-expense mt-2">{error}</p>}
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
        <button type="submit" className="btn-primary" disabled={!amount || !category || scanning}>
          {t('form.saveExpense')}
        </button>
      </div>
    </form>
  );
}
