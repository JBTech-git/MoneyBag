import { prisma } from './db';
import { formatAmount, getCurrency } from './currencies';

export async function loadSettings(userId: string) {
  let settings = await prisma.appSettings.findUnique({ where: { userId } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: {
        userId,
        currencyCode: 'INR',
        currencySymbol: '₹',
        theme: 'dark',
      },
    });
  }
  return settings;
}

export async function formatMoney(amount: number | string, userId: string) {
  const settings = await loadSettings(userId);
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition);
}

export function formatMoneyWith(
  amount: number | string,
  settings: { currencyCode: string; currencyPosition: string },
) {
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition);
}

export async function updateSettings(
  userId: string,
  data: {
    displayName?: string;
    currencyCode?: string;
    currencyPosition?: string;
    theme?: string;
    appMode?: string;
    showZeroBalanceBadge?: boolean;
  },
) {
  const currencyCode = data.currencyCode;
  const config = currencyCode ? getCurrency(currencyCode) : null;
  return prisma.appSettings.upsert({
    where: { userId },
    create: {
      userId,
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
