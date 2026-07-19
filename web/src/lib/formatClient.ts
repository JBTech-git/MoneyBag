import { formatAmount } from './currencies';
import { localeFor, parseLanguage } from './i18n';

export type ClientSettings = {
  currencyCode: string;
  currencyPosition: string;
  theme: string;
  language?: string;
  appMode: string;
  displayName?: string;
  showZeroBalanceBadge?: boolean;
};

export function money(amount: number, settings: ClientSettings) {
  const locale = localeFor(parseLanguage(settings.language, 'en'));
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition, locale);
}
