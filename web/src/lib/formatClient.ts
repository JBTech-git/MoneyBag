import { formatAmount } from './currencies';

export type ClientSettings = {
  currencyCode: string;
  currencyPosition: string;
  theme: string;
  appMode: string;
  displayName?: string;
  showZeroBalanceBadge?: boolean;
};

export function money(amount: number, settings: ClientSettings) {
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition);
}
