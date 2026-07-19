'use client';

import { useEffect, useRef, useState } from 'react';
import MoneybagLoader from '@/components/MoneybagLoader';
import { useT } from '@/components/I18nProvider';
import type { AccessState } from '@/lib/subscription';

type Step = 'email' | 'code';

type Props = {
  onSuccess: (payload: {
    user: { id: string; email: string; name: string };
    access: AccessState;
  }) => void;
};

export default function AuthScreen({ onSuccess }: Props) {
  const { t } = useT();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeHint, setCodeHint] = useState<'dev' | 'email' | 'fallback' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setCodeHint(null);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('auth.sendFailed'));
      if (json.dev_code) {
        setCode(json.dev_code);
        setCodeHint(json.email_fallback ? 'fallback' : 'dev');
      } else {
        setCodeHint('email');
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('auth.verifyFailed'));
      onSuccess({ user: json.user, access: json.access });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      {loading && <MoneybagLoader size="lg" overlay />}
      <div className="auth-screen__card">
        <div className="auth-screen__brand">
          <img src="/icons/Money-bag-5.png" alt="" className="auth-screen__logo" width={56} height={56} />
          <h1 className="auth-screen__title">Moneybag</h1>
          <p className="auth-screen__subtitle">
            {step === 'email'
              ? t('auth.subtitleEmail')
              : codeHint === 'email'
                ? t('auth.subtitleCodeSent', { email })
                : t('auth.subtitleCodeLocal', { email })}
          </p>
        </div>

        {step === 'email' ? (
          <form className="auth-screen__form" onSubmit={sendCode}>
            <label className="auth-screen__field">
              <span>{t('auth.email')}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            {error && <p className="auth-screen__error">{error}</p>}
            <button type="submit" className="btn-primary auth-screen__submit" disabled={loading}>
              {t('auth.continue')}
            </button>
          </form>
        ) : (
          <form className="auth-screen__form" onSubmit={verifyCode}>
            {(codeHint === 'dev' || codeHint === 'fallback') && (
              <div className="auth-screen__code-banner auth-screen__code-banner--dev">
                <span className="material-icons-round">pin</span>
                <div>
                  <p className="auth-screen__code-banner-title">{t('auth.codeTitle')}</p>
                  <p className="auth-screen__code-banner-value">{code}</p>
                  <p className="auth-screen__code-banner-note">
                    {codeHint === 'dev' ? t('auth.codeDevNote') : t('auth.codeFallbackNote')}
                  </p>
                </div>
              </div>
            )}
            {codeHint === 'email' && (
              <div className="auth-screen__code-banner auth-screen__code-banner--sent">
                <span className="material-icons-round">mail</span>
                <div>
                  <p className="auth-screen__code-banner-title">{t('auth.checkEmail')}</p>
                  <p className="auth-screen__code-banner-note">
                    {t('auth.checkEmailNote', { email })}
                  </p>
                </div>
              </div>
            )}
            <label className="auth-screen__field">
              <span>{t('auth.verificationCode')}</span>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                className="auth-screen__code-input"
                autoComplete="one-time-code"
              />
            </label>
            {error && <p className="auth-screen__error">{error}</p>}
            <button type="submit" className="btn-primary auth-screen__submit" disabled={loading || code.length !== 6}>
              {t('auth.verify')}
            </button>
            <button
              type="button"
              className="auth-screen__link auth-screen__back"
              onClick={() => {
                setStep('email');
                setCode('');
                setError('');
                setCodeHint(null);
              }}
            >
              {t('auth.differentEmail')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
