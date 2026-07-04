export const ACCOUNT_TYPES: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  cash: { label: 'Cash', icon: 'payments', color: '#F97316' },
  bank: { label: 'Bank Account', icon: 'account_balance', color: '#1E88E5' },
  card: { label: 'Debit Card', icon: 'credit_card', color: '#FB8C00' },
  savings: { label: 'Savings', icon: 'savings', color: '#8E24AA' },
  credit: { label: 'Credit Card', icon: 'credit_score', color: '#E53935' },
  wallet: { label: 'E-Wallet', icon: 'account_balance_wallet', color: '#00897B' },
};

export function accountTypeMeta(accountType: string) {
  return ACCOUNT_TYPES[accountType] || ACCOUNT_TYPES.cash;
}

export const ACCOUNT_TYPE_CHOICES = Object.entries(ACCOUNT_TYPES).map(
  ([key, meta]) => ({ value: key, label: meta.label }),
);
