import { NextRequest, NextResponse } from 'next/server';
import { CURRENCY_CHOICES } from '@/lib/currencies';
import { authErrorResponse, requireManageAccess, requireUser } from '@/lib/auth';
import { loadSettings, updateSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    const settings = await loadSettings(user.id);
    const [accounts, transactions, incomes, expenses] = await Promise.all([
      prisma.account.count({ where: { userId: user.id } }),
      prisma.transaction.count({ where: { userId: user.id } }),
      prisma.income.count({ where: { userId: user.id } }),
      prisma.expense.count({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({
      settings,
      currency_choices: CURRENCY_CHOICES,
      counts: { accounts, transactions, incomes, expenses },
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

async function saveSettings(req: NextRequest, userId: string) {
  const body = await req.json();
  const settings = await updateSettings(userId, {
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
  try {
    const user = await requireManageAccess();
    return saveSettings(req, user.id);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return PUT(req);
}
