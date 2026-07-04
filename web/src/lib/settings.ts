import { prisma } from './db';
import { formatAmount, getCurrency } from './currencies';

export async function loadSettings() {
  let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { id: 1, currencyCode: 'INR', currencySymbol: '₹', theme: 'dark' },
    });
  }
  return settings;
}

export async function formatMoney(amount: number | string) {
  const settings = await loadSettings();
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition);
}

export function formatMoneyWith(
  amount: number | string,
  settings: { currencyCode: string; currencyPosition: string },
) {
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition);
}

export async function updateSettings(data: {
  displayName?: string;
  currencyCode?: string;
  currencyPosition?: string;
  theme?: string;
  appMode?: string;
  showZeroBalanceBadge?: boolean;
}) {
  const currencyCode = data.currencyCode;
  const config = currencyCode ? getCurrency(currencyCode) : null;
  return prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      displayName: data.displayName ?? '',
      currencyCode: currencyCode ?? 'INR',
      currencySymbol: config?.symbol ?? '₹',
      currencyPosition: data.currencyPosition ?? config?.position ?? 'before',
      theme: data.theme ?? 'dark',
      appMode: data.appMode ?? 'daily',
      showZeroBalanceBadge: data.showZeroBalanceBadge ?? true,
    },
    update: {
      ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      ...(currencyCode
        ? {
            currencyCode,
            currencySymbol: getCurrency(currencyCode).symbol,
          }
        : {}),
      ...(data.currencyPosition !== undefined
        ? { currencyPosition: data.currencyPosition }
        : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.appMode !== undefined ? { appMode: data.appMode } : {}),
      ...(data.showZeroBalanceBadge !== undefined
        ? { showZeroBalanceBadge: data.showZeroBalanceBadge }
        : {}),
    },
  });
}
