'use client';

import { useEffect, useRef, useState } from 'react';
import MoneybagLoader from '@/components/MoneybagLoader';
import type { AccessState } from '@/lib/subscription';

type Step = 'email' | 'code';

type Props = {
  trialDays: number;
  onSuccess: (payload: {
    user: { id: string; email: string; name: string };
    access: AccessState;
  }) => void;
};

export default function AuthScreen({ trialDays, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeHint, setCodeHint] = useState<'dev' | 'email' | null>(null);
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
      if (!res.ok) throw new Error(json.error || 'Could not send code');
      if (json.dev_code) {
        setCode(json.dev_code);
        setCodeHint('dev');
      } else {
        setCodeHint('email');
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
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
      if (!res.ok) throw new Error(json.error || 'Verification failed');
      onSuccess({ user: json.user, access: json.access });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      {loading && <MoneybagLoader size="lg" overlay />}
      <div className="auth-screen__card">
        <div className="auth-screen__brand">
          <img src="/icons/app-icon.png" alt="" className="auth-screen__logo" width={56} height={56} />
          <h1 className="auth-screen__title">Moneybag</h1>
          <p className="auth-screen__subtitle">
            {step === 'email'
              ? `Enter your email. We'll send a code — ${trialDays}-day free trial for new users.`
              : `Enter the 6-digit code sent to ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          <form className="auth-screen__form" onSubmit={sendCode}>
            <label className="auth-screen__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            {error && <p className="auth-screen__error">{error}</p>}
            <button type="submit" className="btn-primary auth-screen__submit" disabled={loading}>
              Continue with email
            </button>
          </form>
        ) : (
          <form className="auth-screen__form" onSubmit={verifyCode}>
            {codeHint === 'dev' && (
              <div className="auth-screen__code-banner auth-screen__code-banner--dev">
                <span className="material-icons-round">pin</span>
                <div>
                  <p className="auth-screen__code-banner-title">Your sign-in code</p>
                  <p className="auth-screen__code-banner-value">{code}</p>
                  <p className="auth-screen__code-banner-note">Local testing — code shown here instead of email.</p>
                </div>
              </div>
            )}
            {codeHint === 'email' && (
              <div className="auth-screen__code-banner auth-screen__code-banner--sent">
                <span className="material-icons-round">mail</span>
                <div>
                  <p className="auth-screen__code-banner-title">Check your email</p>
                  <p className="auth-screen__code-banner-note">
                    We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
                  </p>
                </div>
              </div>
            )}
            <label className="auth-screen__field">
              <span>Verification code</span>
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
              Verify &amp; continue
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
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
