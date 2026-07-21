import { prisma } from './db';
import { formatAmount, getCurrency } from './currencies';
import { localeFor, parseLanguage } from './i18n';

export async function loadSettings(userId: string) {
  let settings = await prisma.appSettings.findUnique({ where: { userId } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: {
        userId,
        currencyCode: 'INR',
        currencySymbol: '₹',
        theme: 'light',
        language: 'en',
      },
    });
  }
  return settings;
}

export async function formatMoney(amount: number | string, userId: string) {
  const settings = await loadSettings(userId);
  return formatMoneyWith(amount, settings);
}

export function formatMoneyWith(
  amount: number | string,
  settings: { currencyCode: string; currencyPosition: string; language?: string },
) {
  const locale = localeFor(parseLanguage(settings.language, 'en'));
  return formatAmount(amount, settings.currencyCode, settings.currencyPosition, locale);
}

export async function updateSettings(
  userId: string,
  data: {
    displayName?: string;
    currencyCode?: string;
    currencyPosition?: string;
    theme?: string;
    language?: string;
    appMode?: string;
    showZeroBalanceBadge?: boolean;
    savingsGoalName?: string;
    savingsGoalTarget?: number;
    savingsGoalCurrent?: number;
  },
) {
  const currencyCode = data.currencyCode;
  const config = currencyCode ? getCurrency(currencyCode) : null;
  const language =
    data.language === 'hi' || data.language === 'bn' || data.language === 'en'
      ? data.language
      : undefined;
  return prisma.appSettings.upsert({
    where: { userId },
    create: {
      userId,
      displayName: data.displayName ?? '',
      currencyCode: currencyCode ?? 'INR',
      currencySymbol: config?.symbol ?? '₹',
      currencyPosition: data.currencyPosition ?? config?.position ?? 'before',
      theme: data.theme ?? 'light',
      language: language ?? 'en',
      appMode: data.appMode ?? 'daily',
      showZeroBalanceBadge: data.showZeroBalanceBadge ?? true,
      savingsGoalName: data.savingsGoalName ?? '',
      savingsGoalTarget: data.savingsGoalTarget ?? 0,
      savingsGoalCurrent: data.savingsGoalCurrent ?? 0,
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
      ...(language !== undefined ? { language } : {}),
      ...(data.appMode !== undefined ? { appMode: data.appMode } : {}),
      ...(data.showZeroBalanceBadge !== undefined
        ? { showZeroBalanceBadge: data.showZeroBalanceBadge }
        : {}),
      ...(data.savingsGoalName !== undefined
        ? { savingsGoalName: data.savingsGoalName }
        : {}),
      ...(data.savingsGoalTarget !== undefined
        ? { savingsGoalTarget: data.savingsGoalTarget }
        : {}),
      ...(data.savingsGoalCurrent !== undefined
        ? { savingsGoalCurrent: data.savingsGoalCurrent }
        : {}),
    },
  });
}
