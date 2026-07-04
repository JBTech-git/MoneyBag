import { NextRequest, NextResponse } from 'next/server';
import { CURRENCY_CHOICES } from '@/lib/currencies';
import { loadSettings, updateSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await loadSettings();
  const [accounts, transactions, incomes, expenses] = await Promise.all([
    prisma.account.count(),
    prisma.transaction.count(),
    prisma.income.count(),
    prisma.expense.count(),
  ]);
  return NextResponse.json({
    settings,
    currency_choices: CURRENCY_CHOICES,
    counts: { accounts, transactions, incomes, expenses },
  });
}

async function saveSettings(req: NextRequest) {
  const body = await req.json();
  const settings = await updateSettings({
    displayName: body.display_name ?? body.displayName,
    currencyCode: body.currency_code ?? body.currencyCode,
    currencyPosition: body.currency_position ?? body.currencyPosition,
    theme: body.theme,
    appMode: body.app_mode ?? body.appMode,
    showZeroBalanceBadge:
      body.show_zero_balance_badge !== undefined
        ? Boolean(body.show_zero_balance_badge)
        : body.showZeroBalanceBadge !== undefined
          ? Boolean(body.showZeroBalanceBadge)
          : undefined,
  });
  return NextResponse.json({ ok: true, message: 'Updated', settings });
}

export async function PUT(req: NextRequest) {
  return saveSettings(req);
}

export async function POST(req: NextRequest) {
  return saveSettings(req);
}
