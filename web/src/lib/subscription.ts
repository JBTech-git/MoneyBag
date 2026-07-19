import type { User } from '@prisma/client';
import { isSuperAdmin } from './adminAccess';
import { getSiteConfig } from './siteConfig';

/** Built-in fallbacks only — runtime values come from Super Admin (site_config). */
export const TRIAL_DAYS = 30;
export const SUBSCRIPTION_DAYS = 30;
export const SUBSCRIPTION_PRICE_LABEL = '₹99/month';

export async function getSubscriptionConfig() {
  const site = await getSiteConfig();
  const qrSrc = site.phonepeQrData || site.phonepeQrImage || '/payments/phonepe-qr.svg';

  return {
    trialDays: site.trialDays,
    subscriptionDays: site.subscriptionDays,
    priceLabel: site.priceLabel,
    demoAllowed: site.allowDemoSubscription,
    supportEmail:
      process.env.SUPPORT_EMAIL?.trim() ||
      process.env.EMAIL_REPLY_TO?.trim() ||
      'info.mnybag@gmail.com',
    phonepe: {
      enabled: site.phonepeEnabled,
      qrImage: qrSrc,
      upiId: site.phonepeUpiId,
      autoActivate: site.paymentAutoActivate,
      instructions:
        site.phonepeInstructions ||
        'Scan this PhonePe QR, pay the subscription amount, then enter your UTR / UPI reference and tap I’ve paid.',
    },
    appUrl: site.appUrl,
  };
}

export type AccessState = {
  hasAccess: boolean;
  status: 'trial' | 'active' | 'expired';
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
  daysLeft: number;
  hoursLeft: number;
};

export function trialEndsAtFromNow(days = TRIAL_DAYS) {
  const ends = new Date();
  ends.setDate(ends.getDate() + days);
  return ends;
}

export function subscriptionEndsAtFromNow(days = SUBSCRIPTION_DAYS) {
  const ends = new Date();
  ends.setDate(ends.getDate() + days);
  return ends;
}

export function getAccessState(user: Pick<
  User,
  'trialEndsAt' | 'subscriptionStatus' | 'subscriptionEndsAt' | 'email' | 'isAdmin'
>, subscriptionDaysFallback = SUBSCRIPTION_DAYS): AccessState {
  const now = Date.now();
  const trialEndsAt = user.trialEndsAt.toISOString();
  const subscriptionEndsAt = user.subscriptionEndsAt?.toISOString() ?? null;

  // Super admins never need a subscription
  if (isSuperAdmin(user)) {
    return {
      hasAccess: true,
      status: 'active',
      trialEndsAt,
      subscriptionEndsAt,
      daysLeft: 9999,
      hoursLeft: 9999 * 24,
    };
  }

  if (
    user.subscriptionStatus === 'active' &&
    (!user.subscriptionEndsAt || user.subscriptionEndsAt.getTime() > now)
  ) {
    const msLeft = user.subscriptionEndsAt
      ? user.subscriptionEndsAt.getTime() - now
      : subscriptionDaysFallback * 24 * 60 * 60 * 1000;
    return {
      hasAccess: true,
      status: 'active',
      trialEndsAt,
      subscriptionEndsAt,
      daysLeft: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24))),
      hoursLeft: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60))),
    };
  }

  const trialMsLeft = user.trialEndsAt.getTime() - now;
  if (trialMsLeft > 0) {
    return {
      hasAccess: true,
      status: 'trial',
      trialEndsAt,
      subscriptionEndsAt,
      daysLeft: Math.max(1, Math.ceil(trialMsLeft / (1000 * 60 * 60 * 24))),
      hoursLeft: Math.max(1, Math.ceil(trialMsLeft / (1000 * 60 * 60))),
    };
  }

  return {
    hasAccess: false,
    status: 'expired',
    trialEndsAt,
    subscriptionEndsAt,
    daysLeft: 0,
    hoursLeft: 0,
  };
}

export function serializeAccess(user: Pick<
  User,
  'trialEndsAt' | 'subscriptionStatus' | 'subscriptionEndsAt' | 'email' | 'isAdmin'
>) {
  return getAccessState(user);
}
