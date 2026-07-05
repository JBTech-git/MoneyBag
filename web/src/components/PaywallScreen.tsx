'use client';

import { useEffect, useState } from 'react';
import MoneybagLoader from '@/components/MoneybagLoader';
import type { AccessState } from '@/lib/subscription';

type SubscriptionConfig = {
  priceLabel: string;
  subscriptionDays: number;
  demoAllowed: boolean;
  supportEmail: string;
};

type Props = {
  user: { email: string; name: string };
  access: AccessState;
  onActivated: (access: AccessState) => void;
  onViewData: () => void;
  onLogout: () => void;
};

export default function PaywallScreen({ user, access, onActivated, onViewData, onLogout }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<SubscriptionConfig | null>(null);

  useEffect(() => {
    fetch('/api/subscription/config', { cache: 'no-store' })
      .then((res) => res.json())
      .then(setConfig)
      .catch(() => {
        setConfig({
          priceLabel: '₹99/month',
          subscriptionDays: 30,
          demoAllowed: true,
          supportEmail: 'info.mnybag@gmail.com',
        });
      });
  }, []);

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

  const trialEnded = new Date(access.trialEndsAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const supportEmail = config?.supportEmail || 'info.mnybag@gmail.com';
  const priceLabel = config?.priceLabel || '₹99/month';
  const subscriptionDays = config?.subscriptionDays || 30;
  const demoAllowed = config?.demoAllowed ?? true;

  return (
    <div className="paywall-screen">
      {loading && <MoneybagLoader size="lg" overlay />}
      <div className="paywall-screen__card">
        <div className="paywall-screen__icon">
          <span className="material-icons-round">lock</span>
        </div>
        <h1 className="paywall-screen__title">Your free trial has ended</h1>
        <p className="paywall-screen__text">
          Hi {user.name || user.email}, your trial ended on {trialEnded}. Subscribe to keep adding and
          editing transactions. Your data is saved and waiting for you.
        </p>

        <div className="paywall-screen__price">
          <span className="paywall-screen__price-label">{priceLabel}</span>
          <span className="paywall-screen__price-note">{subscriptionDays}-day access</span>
        </div>

        <ul className="paywall-screen__features">
          <li><span className="material-icons-round">check_circle</span>Daily &amp; monthly tracking</li>
          <li><span className="material-icons-round">check_circle</span>Budget categories &amp; wallets</li>
          <li><span className="material-icons-round">check_circle</span>Activity ledger &amp; calendar</li>
        </ul>

        {error && <p className="paywall-screen__error">{error}</p>}

        {demoAllowed ? (
          <button type="button" className="btn-primary paywall-screen__cta" onClick={activate} disabled={loading}>
            Subscribe now
          </button>
        ) : (
          <a
            className="btn-primary paywall-screen__cta paywall-screen__cta-link"
            href={`mailto:${supportEmail}?subject=Moneybag%20subscription&body=Hi%2C%20I%20would%20like%20to%20subscribe.%20My%20email%3A%20${encodeURIComponent(user.email)}`}
          >
            Contact us to subscribe
          </a>
        )}

        <button type="button" className="paywall-screen__secondary" onClick={onViewData}>
          View my data (read-only)
        </button>

        <p className="paywall-screen__support">
          Questions?{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        </p>

        <button type="button" className="paywall-screen__logout" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
