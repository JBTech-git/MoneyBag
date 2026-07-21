'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/components/I18nProvider';

type CalcMode = 'sip' | 'lumpsum';

/**
 * Groww SIP formula (https://groww.in/calculators/sip-calculator):
 *   i = (1 + annual)^(1/12) − 1
 *   M = P × (([1 + i]^n − 1) / i) × (1 + i)
 */
export function sipFutureValueGroww(monthly: number, annualRatePct: number, years: number) {
  const n = Math.max(0, Math.round(years * 12));
  if (!(monthly > 0) || n <= 0) return { invested: 0, value: 0, returns: 0 };

  const invested = monthly * n;
  const annual = annualRatePct / 100;
  if (annual === 0) return { invested, value: invested, returns: 0 };

  const i = Math.pow(1 + annual, 1 / 12) - 1;
  const value = monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  const rounded = Math.round(value);
  return {
    invested,
    value: rounded,
    returns: rounded - invested,
  };
}

/**
 * Groww lumpsum formula (https://groww.in/calculators/lumpsum-calculator):
 *   A = P × (1 + r)^t
 * Example: ₹15,00,000 @ 12% for 5 years ≈ ₹26,43,513
 */
export function lumpsumFutureValueGroww(principal: number, annualRatePct: number, years: number) {
  const t = Math.max(0, years);
  if (!(principal > 0) || t <= 0) return { invested: 0, value: 0, returns: 0 };

  const invested = principal;
  const r = annualRatePct / 100;
  if (r === 0) return { invested, value: invested, returns: 0 };

  const rounded = Math.round(principal * Math.pow(1 + r, t));
  return {
    invested,
    value: rounded,
    returns: rounded - invested,
  };
}

function parsePositive(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function SipCalculator({
  m,
  onClose,
}: {
  m: (n: number) => string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<CalcMode>('sip');
  /** Shared amount: monthly SIP or lumpsum principal (same field, recalculates on toggle). */
  const [amount, setAmount] = useState('5000');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('10');
  const [showFormula, setShowFormula] = useState(false);

  const amountN = parsePositive(amount);
  const rateN = parsePositive(rate);
  const yearsN = parsePositive(years);

  const result = useMemo(() => {
    if (mode === 'lumpsum') {
      return lumpsumFutureValueGroww(amountN, rateN, yearsN);
    }
    return sipFutureValueGroww(amountN, rateN, yearsN);
  }, [mode, amountN, rateN, yearsN]);

  return (
    <div className="form-sheet">
      <div className="form-sheet__head sip-head">
        <div className="sip-head__title-row">
          <h3 className="form-sheet__title">{t('more.sip')}</h3>
          <button
            type="button"
            className="sip-info-btn"
            aria-label={t('form.calcFormulaTitle')}
            aria-expanded={showFormula}
            onClick={() => setShowFormula((v) => !v)}
          >
            <span className="material-icons-round">info</span>
          </button>
        </div>
        <p className="text-sm text-md-on-surface-variant">{t('more.sipDesc')}</p>
      </div>

      <div className="add-type-tabs mb-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sip'}
          className={`add-type-tab ${mode === 'sip' ? 'add-type-tab--active' : ''}`}
          onClick={() => setMode('sip')}
        >
          {t('form.sipTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'lumpsum'}
          className={`add-type-tab ${mode === 'lumpsum' ? 'add-type-tab--active' : ''}`}
          onClick={() => setMode('lumpsum')}
        >
          {t('form.lumpsumTab')}
        </button>
      </div>

      {showFormula && (
        <div className="sip-formula" role="region" aria-label={t('form.calcFormulaTitle')}>
          <p className="sip-formula__title">{t('form.sipFormulaTitle')}</p>
          <p className="sip-formula__eq">M = P × (&#123;[1 + i]<sup>n</sup> − 1&#125; / i) × (1 + i)</p>
          <p className="sip-formula__eq">i = (1 + r)<sup>1/12</sup> − 1</p>
          <ul className="sip-formula__list">
            <li><strong>M</strong> — {t('form.sipFormulaM')}</li>
            <li><strong>P</strong> — {t('form.sipFormulaP')}</li>
            <li><strong>n</strong> — {t('form.sipFormulaN')}</li>
            <li><strong>r</strong> — {t('form.sipFormulaR')}</li>
            <li><strong>i</strong> — {t('form.sipFormulaI')}</li>
          </ul>
          <p className="sip-formula__example">{t('form.sipFormulaExample')}</p>

          <hr className="sip-formula__divider" />

          <p className="sip-formula__title">{t('form.lumpsumFormulaTitle')}</p>
          <p className="sip-formula__eq">A = P × (1 + r)<sup>t</sup></p>
          <ul className="sip-formula__list">
            <li><strong>A</strong> — {t('form.lumpsumFormulaA')}</li>
            <li><strong>P</strong> — {t('form.lumpsumFormulaP')}</li>
            <li><strong>r</strong> — {t('form.lumpsumFormulaR')}</li>
            <li><strong>t</strong> — {t('form.lumpsumFormulaT')}</li>
          </ul>
          <p className="sip-formula__example">{t('form.lumpsumFormulaExample')}</p>
        </div>
      )}

      <div className="form-section">
        <div className="form-field form-field--amount">
          <label className="form-field__label">
            {mode === 'sip' ? t('form.sipMonthly') : t('form.lumpsumAmount')}
          </label>
          <input
            className="md-input"
            type="number"
            min={mode === 'sip' ? 100 : 500}
            step={mode === 'sip' ? 500 : 1000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.sipRate')}</label>
          <input
            className="md-input"
            type="number"
            min="1"
            max="30"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-field__label">{t('form.sipYears')}</label>
          <input
            className="md-input"
            type="number"
            min="1"
            max="40"
            step="1"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </div>
      </div>

      <div className="sip-result" key={`${mode}-${amountN}-${rateN}-${yearsN}`}>
        <div className="sip-result__row">
          <span>{t('form.sipInvested')}</span>
          <strong>{m(result.invested)}</strong>
        </div>
        <div className="sip-result__row">
          <span>{t('form.sipReturns')}</span>
          <strong className="amount-income">{m(result.returns)}</strong>
        </div>
        <div className="sip-result__row sip-result__row--total">
          <span>{t('form.sipValue')}</span>
          <strong>{m(result.value)}</strong>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="form-actions__btn form-actions__icon" onClick={onClose}>
          <span className="material-icons-round">close</span>
        </button>
      </div>
    </div>
  );
}
