import { accountTypeLabel, parseLanguage } from '@/lib/i18n';

export const ACCOUNT_TYPES: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  cash: { label: 'Cash', icon: 'payments', color: '#1E3A8A' },
  bank: { label: 'Bank Account', icon: 'account_balance', color: '#2563EB' },
  card: { label: 'Debit Card', icon: 'credit_card', color: '#FBBF24' },
  savings: { label: 'Savings', icon: 'savings', color: '#8E24AA' },
  credit: { label: 'Credit Card', icon: 'credit_score', color: '#E53935' },
  wallet: { label: 'E-Wallet', icon: 'account_balance_wallet', color: '#00897B' },
};

export function accountTypeMeta(accountType: string, language?: string) {
  const meta = ACCOUNT_TYPES[accountType] || ACCOUNT_TYPES.cash;
  const lang = parseLanguage(language, 'en');
  return {
    ...meta,
    label: accountTypeLabel(lang, accountType in ACCOUNT_TYPES ? accountType : 'cash'),
  };
}

export function accountTypeChoices(language?: string) {
  const lang = parseLanguage(language, 'en');
  return Object.keys(ACCOUNT_TYPES).map((key) => ({
    value: key,
    label: accountTypeLabel(lang, key),
  }));
}

export const ACCOUNT_TYPE_CHOICES = Object.entries(ACCOUNT_TYPES).map(
  ([key, meta]) => ({ value: key, label: meta.label }),
);
