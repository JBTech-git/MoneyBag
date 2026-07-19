'use client';

import { useEffect, useState } from 'react';
import MoneybagLoader from '@/components/MoneybagLoader';
import type { AccessState } from '@/lib/subscription';

type PhonePeConfig = {
  enabled: boolean;
  qrImage: string;
  upiId: string;
  autoActivate: boolean;
  instructions: string;
};

type SubscriptionConfig = {
  priceLabel: string;
  subscriptionDays: number;
  demoAllowed: boolean;
  supportEmail: string;
  phonepe?: PhonePeConfig;
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
  const [success, setSuccess] = useState('');
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [proofData, setProofData] = useState('');
  const [qrBroken, setQrBroken] = useState(false);
  const [config, setConfig] = useState<SubscriptionConfig | null>(null);

  useEffect(() => {
    fetch('/api/subscription/config', { cache: 'no-store' })
      .then((res) => res.json())
      .then(setConfig)
      .catch(() => {
        setConfig({
          priceLabel: '₹99/month',
          subscriptionDays: 30,
          demoAllowed: false,
          supportEmail: 'info.mnybag@gmail.com',
        });
      });
  }, []);

  const onProofFile = (file: File | null) => {
    if (!file) {
      setProofData('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Payment proof must be an image');
      return;
    }
    if (file.size > 650_000) {
      setError('Proof image must be under 650KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofData(String(reader.result || ''));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const claimPayment = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/subscription/claim-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utr, note, proof_data: proofData || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not record payment');
      }
      if (json.auto_activated && json.access) {
        onActivated(json.access);
        return;
      }
      setSuccess(json.message || 'Payment recorded. Waiting for admin review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const activateDemo = async () => {
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
  const demoAllowed = config?.demoAllowed ?? false;
  const phonepe = config?.phonepe;
  const phonepeEnabled = Boolean(phonepe?.enabled);

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

        {phonepeEnabled && (
          <div className="paywall-phonepe">
            <p className="paywall-phonepe__heading">Pay with PhonePe</p>
            <p className="paywall-phonepe__hint">{phonepe?.instructions}</p>
            {!qrBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="paywall-phonepe__qr"
                src={phonepe?.qrImage || '/payments/phonepe-qr.svg'}
                alt="PhonePe payment QR code"
                onError={() => setQrBroken(true)}
              />
            ) : (
              <div className="paywall-phonepe__qr-missing">
                QR image not found. Ask support to upload the PhonePe QR.
              </div>
            )}
            {phonepe?.upiId ? (
              <p className="paywall-phonepe__upi">
                UPI ID: <strong>{phonepe.upiId}</strong>
              </p>
            ) : null}
            <label className="paywall-phonepe__field">
              UTR / transaction ID
              <input
                type="text"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder="e.g. 123456789012"
                autoComplete="off"
              />
            </label>
            <label className="paywall-phonepe__field">
              Note (optional)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Your name on PhonePe"
                autoComplete="off"
              />
            </label>
            <label className="paywall-phonepe__field">
              Payment screenshot (optional)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onProofFile(e.target.files?.[0] || null)}
              />
            </label>
            {proofData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="paywall-phonepe__proof" src={proofData} alt="Payment proof preview" />
            ) : null}
            <button
              type="button"
              className="btn-primary paywall-screen__cta"
              onClick={claimPayment}
              disabled={loading || utr.trim().length < 4}
            >
              {phonepe?.autoActivate ? "I've paid — activate" : "I've paid — submit for review"}
            </button>
          </div>
        )}

        {error && <p className="paywall-screen__error">{error}</p>}
        {success && <p className="paywall-screen__success">{success}</p>}

        {!phonepeEnabled && demoAllowed && (
          <button type="button" className="btn-primary paywall-screen__cta" onClick={activateDemo} disabled={loading}>
            Subscribe now
          </button>
        )}

        {!phonepeEnabled && !demoAllowed && (
          <a
            className="btn-primary paywall-screen__cta paywall-screen__cta-link"
            href={`mailto:${supportEmail}?subject=Moneybag%20subscription&body=Hi%2C%20I%20would%20like%20to%20subscribe.%20My%20email%3A%20${encodeURIComponent(user.email)}`}
          >
            Contact us to subscribe
          </a>
        )}

        {phonepeEnabled && demoAllowed && (
          <button type="button" className="paywall-screen__secondary" onClick={activateDemo} disabled={loading}>
            Demo activate (testing)
          </button>
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
