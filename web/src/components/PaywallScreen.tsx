'use client';

import { useState } from 'react';
import MoneybagLoader from '@/components/MoneybagLoader';
import type { AccessState } from '@/lib/subscription';

type Props = {
  user: { email: string; name: string };
  access: AccessState;
  onActivated: (access: AccessState) => void;
  onLogout: () => void;
};

export default function PaywallScreen({ user, access, onActivated, onLogout }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/subscription/activate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not activate subscription');
      }
      onActivated(json.access);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const trialEnded = new Date(access.trialEndsAt).toLocaleString();

  return (
    <div className="paywall-screen">
      {loading && <MoneybagLoader size="lg" overlay />}
      <div className="paywall-screen__card">
        <div className="paywall-screen__icon">
          <span className="material-icons-round">lock</span>
        </div>
        <h1 className="paywall-screen__title">Trial ended</h1>
        <p className="paywall-screen__text">
          Hi {user.name || user.email}, your free trial ended on {trialEnded}. Subscribe to keep adding
          transactions, budgets, and accounts.
        </p>
        <ul className="paywall-screen__features">
          <li><span className="material-icons-round">check_circle</span>Daily &amp; monthly tracking</li>
          <li><span className="material-icons-round">check_circle</span>Budget categories &amp; wallets</li>
          <li><span className="material-icons-round">check_circle</span>Activity ledger &amp; calendar</li>
        </ul>
        {error && <p className="paywall-screen__error">{error}</p>}
        <button type="button" className="btn-primary paywall-screen__cta" onClick={activate} disabled={loading}>
          Subscribe now
        </button>
        <button type="button" className="paywall-screen__logout" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
