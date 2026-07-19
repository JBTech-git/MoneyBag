'use client';

import { useCallback, useEffect, useState } from 'react';

type SiteSettings = {
  trial_days: number;
  subscription_days: number;
  price_label: string;
  allow_demo_subscription: boolean;
  phonepe_enabled: boolean;
  phonepe_upi_id: string;
  phonepe_qr_image: string;
  phonepe_qr_data: string;
  phonepe_qr_preview: string;
  payment_auto_activate: boolean;
  phonepe_instructions: string;
  app_url: string;
};

type Props = {
  onToast: (message: string) => void;
};

const empty: SiteSettings = {
  trial_days: 30,
  subscription_days: 30,
  price_label: '₹99/month',
  allow_demo_subscription: false,
  phonepe_enabled: true,
  phonepe_upi_id: '',
  phonepe_qr_image: '/payments/phonepe-qr.svg',
  phonepe_qr_data: '',
  phonepe_qr_preview: '/payments/phonepe-qr.svg',
  payment_auto_activate: true,
  phonepe_instructions: '',
  app_url: '',
};

export default function AdminSiteSettings({ onToast }: Props) {
  const [form, setForm] = useState<SiteSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingQr, setPendingQr] = useState<string | null>(null);
  const [clearQr, setClearQr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/site-config', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load settings');
      setForm({ ...empty, ...json.settings });
      setPendingQr(null);
      setClearQr(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onQrFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onToast('Choose an image file for the QR');
      return;
    }
    if (file.size > 650_000) {
      onToast('QR image must be under 650KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setPendingQr(result);
      setClearQr(false);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        trial_days: form.trial_days,
        subscription_days: form.subscription_days,
        price_label: form.price_label,
        allow_demo_subscription: form.allow_demo_subscription,
        phonepe_enabled: form.phonepe_enabled,
        phonepe_upi_id: form.phonepe_upi_id,
        phonepe_qr_image: form.phonepe_qr_image,
        payment_auto_activate: form.payment_auto_activate,
        phonepe_instructions: form.phonepe_instructions,
        app_url: form.app_url,
      };
      if (clearQr) body.clear_qr = true;
      else if (pendingQr) body.phonepe_qr_data = pendingQr;

      const res = await fetch('/api/admin/site-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setForm({ ...empty, ...json.settings });
      setPendingQr(null);
      setClearQr(false);
      onToast(json.message || 'Settings saved');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const preview = clearQr
    ? form.phonepe_qr_image
    : pendingQr || form.phonepe_qr_preview || form.phonepe_qr_image;

  if (loading) {
    return (
      <section className="admin-settings">
        <h2 className="admin-settings__title">Subscription & PhonePe</h2>
        <p className="admin-dash__muted">Loading settings…</p>
      </section>
    );
  }

  return (
    <section className="admin-settings">
      <div className="admin-settings__head">
        <div>
          <h2 className="admin-settings__title">Subscription & PhonePe</h2>
          <p className="admin-settings__sub">
            Change these anytime — no need to edit .env or redeploy.
          </p>
        </div>
        <button type="button" className="admin-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="admin-settings__grid">
        <label className="admin-field">
          Trial days (new users)
          <input
            type="number"
            min={1}
            max={3650}
            value={form.trial_days}
            onChange={(e) => setField('trial_days', Number(e.target.value))}
          />
        </label>
        <label className="admin-field">
          Subscription days
          <input
            type="number"
            min={1}
            max={3650}
            value={form.subscription_days}
            onChange={(e) => setField('subscription_days', Number(e.target.value))}
          />
        </label>
        <label className="admin-field">
          Price label
          <input
            type="text"
            value={form.price_label}
            onChange={(e) => setField('price_label', e.target.value)}
            placeholder="₹99/month"
          />
        </label>
        <label className="admin-field">
          App URL (for emails)
          <input
            type="url"
            value={form.app_url}
            onChange={(e) => setField('app_url', e.target.value)}
            placeholder="https://money-bag-five.vercel.app"
          />
        </label>
      </div>

      <div className="admin-settings__checks">
        <label className="admin-check">
          <input
            type="checkbox"
            checked={form.phonepe_enabled}
            onChange={(e) => setField('phonepe_enabled', e.target.checked)}
          />
          Enable PhonePe QR payments
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={form.payment_auto_activate}
            onChange={(e) => setField('payment_auto_activate', e.target.checked)}
          />
          Auto-activate when user taps “I’ve paid” (unsafe for real payments — keep OFF)
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={form.allow_demo_subscription}
            onChange={(e) => setField('allow_demo_subscription', e.target.checked)}
          />
          Allow demo subscribe with no payment (keep OFF in production)
        </label>
      </div>

      <div className="admin-settings__grid">
        <label className="admin-field">
          PhonePe / UPI ID
          <input
            type="text"
            value={form.phonepe_upi_id}
            onChange={(e) => setField('phonepe_upi_id', e.target.value)}
            placeholder="yourname@ybl"
          />
        </label>
        <label className="admin-field">
          Fallback QR path (optional)
          <input
            type="text"
            value={form.phonepe_qr_image}
            onChange={(e) => setField('phonepe_qr_image', e.target.value)}
            placeholder="/payments/phonepe-qr.png"
          />
        </label>
      </div>

      <label className="admin-field">
        Paywall instructions
        <textarea
          rows={2}
          value={form.phonepe_instructions}
          onChange={(e) => setField('phonepe_instructions', e.target.value)}
          placeholder="Scan this PhonePe QR, pay, then enter UTR…"
        />
      </label>

      <div className="admin-settings__qr">
        <div>
          <p className="admin-field__label">PhonePe QR image</p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onQrFile(e.target.files?.[0] || null)}
          />
          <div className="admin-settings__qr-actions">
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => {
                setPendingQr(null);
                setClearQr(true);
              }}
            >
              Clear uploaded QR
            </button>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="admin-settings__qr-preview" src={preview} alt="PhonePe QR preview" />
      </div>
    </section>
  );
}
