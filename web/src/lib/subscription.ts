import type { User } from '@prisma/client';

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 2);
export const SUBSCRIPTION_DAYS = Number(process.env.SUBSCRIPTION_DAYS || 30);
export const SUBSCRIPTION_PRICE_LABEL =
  process.env.SUBSCRIPTION_PRICE_LABEL?.trim() || '₹99/month';

export function getSubscriptionConfig() {
  return {
    trialDays: TRIAL_DAYS,
    subscriptionDays: SUBSCRIPTION_DAYS,
    priceLabel: SUBSCRIPTION_PRICE_LABEL,
    demoAllowed: process.env.ALLOW_DEMO_SUBSCRIPTION === 'true',
    supportEmail:
      process.env.SUPPORT_EMAIL?.trim() ||
      process.env.EMAIL_REPLY_TO?.trim() ||
      'info.mnybag@gmail.com',
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
  'trialEndsAt' | 'subscriptionStatus' | 'subscriptionEndsAt'
>): AccessState {
  const now = Date.now();
  const trialEndsAt = user.trialEndsAt.toISOString();
  const subscriptionEndsAt = user.subscriptionEndsAt?.toISOString() ?? null;

  if (
    user.subscriptionStatus === 'active' &&
    (!user.subscriptionEndsAt || user.subscriptionEndsAt.getTime() > now)
  ) {
    const msLeft = user.subscriptionEndsAt
      ? user.subscriptionEndsAt.getTime() - now
      : SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000;
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
  'trialEndsAt' | 'subscriptionStatus' | 'subscriptionEndsAt'
>) {
  return getAccessState(user);
}
