'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSiteSettings from '@/components/AdminSiteSettings';

type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  disabled: boolean;
  subscription_status: string;
  access_status: string;
  trial_ends_at: string;
  subscription_ends_at: string | null;
  created_at: string;
  counts: {
    accounts: number;
    transactions: number;
  };
};

type Stats = {
  total_users: number;
  active_subscriptions: number;
  trial_active: number;
  trial_expired: number;
  disabled_users: number;
  admins: number;
  new_last_7_days: number;
  total_transactions: number;
};

type StatusFilter = 'all' | 'active' | 'trial' | 'expired' | 'disabled' | 'admin';

type PaymentClaimRow = {
  id: string;
  amount_label: string;
  utr: string;
  note: string;
  status: string;
  has_proof: boolean;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
  user: { id: string; email: string; name: string };
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [claims, setClaims] = useState<PaymentClaimRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'all') params.set('status', status);
      const [statsRes, usersRes, claimsRes] = await Promise.all([
        fetch('/api/admin/stats', { cache: 'no-store' }),
        fetch(`/api/admin/users?${params}`, { cache: 'no-store' }),
        fetch('/api/admin/payment-claims', { cache: 'no-store' }),
      ]);
      const statsJson = await statsRes.json();
      const usersJson = await usersRes.json();
      const claimsJson = await claimsRes.json();
      if (statsRes.status === 401 || usersRes.status === 401) {
        window.location.href = '/';
        return;
      }
      if (statsRes.status === 403 || usersRes.status === 403) {
        setError('Super admin access required');
        setLoading(false);
        return;
      }
      if (!statsRes.ok) throw new Error(statsJson.error || 'Stats failed');
      if (!usersRes.ok) throw new Error(usersJson.error || 'Users failed');
      setStats(statsJson.stats);
      setUsers(usersJson.users);
      setTotal(usersJson.total);
      if (claimsRes.ok) setClaims(claimsJson.claims || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (userId: string, action: string, days?: number) => {
    if (action === 'delete' && !window.confirm('Permanently delete this user and ALL their data (wallets, transactions, budgets, payment claims)? This cannot be undone.')) return;
    setBusyId(userId);
    setToast('');
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setToast(json.message || 'Done');
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const openProof = async (claimId: string) => {
    setToast('');
    try {
      const res = await fetch(`/api/admin/payment-claims/${claimId}/proof`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load proof');
      setProofPreview(json.proof_data);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not load proof');
    }
  };

  const runClaimAction = async (claimId: string, action: 'approve' | 'reject') => {
    const label = action === 'approve' ? 'Approve and activate this user?' : 'Reject this claim? (revokes access if already activated)';
    if (!window.confirm(label)) return;
    setBusyClaimId(claimId);
    setToast('');
    try {
      const res = await fetch(`/api/admin/payment-claims/${claimId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Claim action failed');
      setToast(json.message || 'Done');
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Claim action failed');
    } finally {
      setBusyClaimId(null);
    }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="admin-dash">
      <header className="admin-dash__header">
        <div>
          <p className="admin-dash__eyebrow">Moneybag</p>
          <h1 className="admin-dash__title">Super Admin</h1>
        </div>
        <div className="admin-dash__header-actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => load()} disabled={loading}>
            Refresh
          </button>
          <Link href="/" className="admin-btn admin-btn--ghost">
            Back to app
          </Link>
        </div>
      </header>

      {error && <p className="admin-dash__error">{error}</p>}
      {toast && <p className="admin-dash__toast">{toast}</p>}

      <AdminSiteSettings onToast={setToast} />

      {stats && (
        <div className="admin-stats">
          {[
            { label: 'Users', value: stats.total_users },
            { label: 'Active subs', value: stats.active_subscriptions },
            { label: 'On trial', value: stats.trial_active },
            { label: 'Expired', value: stats.trial_expired },
            { label: 'Disabled', value: stats.disabled_users },
            { label: 'Admins', value: stats.admins },
            { label: 'New (7d)', value: stats.new_last_7_days },
            { label: 'Transactions', value: stats.total_transactions },
          ].map((s) => (
            <div key={s.label} className="admin-stat">
              <p className="admin-stat__value">{s.value}</p>
              <p className="admin-stat__label">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {claims.length > 0 && (
        <section className="admin-claims">
          <h2 className="admin-claims__title">Recent PhonePe claims</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>UTR / Proof</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td>{fmt(c.created_at)}</td>
                    <td>
                      <div className="admin-user">
                        <strong>{c.user.name || '—'}</strong>
                        <span>{c.user.email}</span>
                      </div>
                    </td>
                    <td>{c.amount_label || '—'}</td>
                    <td>
                      <code className="admin-claims__utr">{c.utr}</code>
                      {c.note ? <div className="admin-claims__note">{c.note}</div> : null}
                      {c.has_proof ? (
                        <button
                          type="button"
                          className="admin-claims__proof-btn"
                          onClick={() => openProof(c.id)}
                        >
                          View proof
                        </button>
                      ) : (
                        <div className="admin-claims__note">No screenshot</div>
                      )}
                      {c.review_note ? (
                        <div className="admin-claims__note">Review: {c.review_note}</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`admin-pill admin-pill--${
                          c.status === 'activated' ? 'active' : c.status === 'rejected' ? 'disabled' : 'trial'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-actions">
                        {c.status === 'pending' || c.status === 'rejected' ? (
                          <button
                            type="button"
                            disabled={busyClaimId === c.id}
                            onClick={() => runClaimAction(c.id, 'approve')}
                          >
                            Approve
                          </button>
                        ) : null}
                        {c.status !== 'rejected' ? (
                          <button
                            type="button"
                            disabled={busyClaimId === c.id}
                            onClick={() => runClaimAction(c.id, 'reject')}
                          >
                            Reject
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === c.user.id}
                          onClick={() => runAction(c.user.id, 'revoke')}
                        >
                          Revoke access
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {proofPreview && (
        <div className="admin-proof-modal" role="dialog" aria-modal="true" onClick={() => setProofPreview(null)}>
          <div className="admin-proof-modal__card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-proof-modal__head">
              <strong>Payment proof</strong>
              <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setProofPreview(null)}>
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proofPreview} alt="Payment proof" className="admin-proof-modal__img" />
          </div>
        </div>
      )}

      <div className="admin-toolbar">
        <input
          className="admin-search"
          type="search"
          placeholder="Search email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load();
          }}
        />
        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
          <option value="admin">Admins</option>
        </select>
        <button type="button" className="admin-btn" onClick={() => load()}>
          Search
        </button>
        <span className="admin-toolbar__count">{total} users</span>
      </div>

      {loading && !users.length ? (
        <p className="admin-dash__muted">Loading…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Trial end</th>
                <th>Sub end</th>
                <th>Data</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.disabled ? 'admin-table__row--disabled' : ''}>
                  <td>
                    <div className="admin-user">
                      <strong>{u.name || '—'}</strong>
                      <span>{u.email}</span>
                      {u.is_admin && <em className="admin-badge">Admin</em>}
                    </div>
                  </td>
                  <td>
                    <span className={`admin-pill admin-pill--${u.access_status}`}>
                      {u.access_status}
                    </span>
                  </td>
                  <td>{fmt(u.trial_ends_at)}</td>
                  <td>{fmt(u.subscription_ends_at)}</td>
                  <td>
                    {u.counts.accounts} wallets · {u.counts.transactions} tx
                  </td>
                  <td>
                    <div className="admin-actions">
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => runAction(u.id, 'extend_trial', 7)}
                      >
                        +7d trial
                      </button>
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => runAction(u.id, 'activate', 30)}
                      >
                        Activate 30d
                      </button>
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => runAction(u.id, 'revoke')}
                      >
                        Revoke
                      </button>
                      {!u.is_admin ? (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => runAction(u.id, 'make_admin')}
                        >
                          Make admin
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => runAction(u.id, 'remove_admin')}
                        >
                          Remove admin
                        </button>
                      )}
                      {u.disabled ? (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => runAction(u.id, 'enable')}
                        >
                          Enable
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => runAction(u.id, 'disable')}
                        >
                          Disable
                        </button>
                      )}
                      <button
                        type="button"
                        className="admin-actions__danger"
                        disabled={busyId === u.id}
                        onClick={() => runAction(u.id, 'delete')}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={6} className="admin-dash__muted">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
