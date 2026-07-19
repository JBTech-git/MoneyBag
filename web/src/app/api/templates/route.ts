import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toNum } from '@/lib/money';
import { assertAccountOwned } from '@/lib/ownership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeTemplate(t: {
  id: number;
  label: string;
  transactionType: string;
  categoryName: string;
  amount: { toString(): string } | number;
  memo: string;
  accountId: number | null;
}) {
  return {
    id: t.id,
    label: t.label,
    transaction_type: t.transactionType,
    category_name: t.categoryName,
    amount: toNum(t.amount),
    memo: t.memo,
    account_id: t.accountId,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const templates = await prisma.quickTemplate.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json({ ok: true, templates: templates.map(serializeTemplate) });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not load templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireManageAccess();
    const body = await req.json();
    const accountId = body.account || body.accountId
      ? Number(body.account || body.accountId)
      : null;
    if (accountId) await assertAccountOwned(user.id, accountId);

    const template = await prisma.quickTemplate.create({
      data: {
        userId: user.id,
        label: (body.label || body.category_name || 'Template').toString().slice(0, 40),
        transactionType: body.transaction_type || body.transactionType || 'expense',
        categoryName: body.category_name || body.categoryName || '',
        amount: Number(body.amount || 0),
        memo: body.memo || '',
        accountId,
      },
    });

    return NextResponse.json({
      ok: true,
      template: serializeTemplate(template),
      message: 'Template saved',
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not save template' }, { status: 500 });
  }
}
