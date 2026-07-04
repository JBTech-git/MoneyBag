export type CurrencyConfig = {
  code: string;
  name: string;
  symbol: string;
  position: 'before' | 'after';
  decimal_places: number;
};

export const CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', position: 'before', decimal_places: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', position: 'before', decimal_places: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', position: 'before', decimal_places: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', position: 'before', decimal_places: 2 },
  PKR: { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', position: 'before', decimal_places: 2 },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', position: 'before', decimal_places: 2 },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', position: 'before', decimal_places: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', position: 'before', decimal_places: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', position: 'before', decimal_places: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', position: 'before', decimal_places: 0 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', position: 'before', decimal_places: 2 },
  BDT: { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', position: 'before', decimal_places: 2 },
};

export function getCurrency(code: string): CurrencyConfig {
  return CURRENCIES[code] || CURRENCIES.USD;
}

export function formatAmount(
  amount: number | string,
  currencyCode: string,
  positionOverride?: string | null,
): string {
  const config = getCurrency(currencyCode);
  const value = Number(amount || 0);
  const decimalPlaces = config.decimal_places;
  const abs = Math.abs(value);
  const absText =
    decimalPlaces === 0
      ? Math.round(abs).toLocaleString('en-US')
      : abs.toLocaleString('en-US', {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        });
  const prefix = value < 0 ? '-' : '';
  const position = positionOverride || config.position;
  const symbol = config.symbol;
  const body = position === 'after' ? `${absText}${symbol}` : `${symbol}${absText}`;
  return `${prefix}${body}`;
}

export const CURRENCY_CHOICES = Object.values(CURRENCIES).map((c) => ({
  value: c.code,
  label: `${c.name} (${c.symbol})`,
}));
