import { NextRequest, NextResponse } from 'next/server';
import { accountTypeMeta } from '@/lib/accounts';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const accountType = body.accountType || body.account_type || 'cash';
  const meta = accountTypeMeta(accountType);
  const isDefault = Boolean(body.is_default || body.isDefault);
  if (isDefault) {
    await prisma.account.updateMany({ data: { isDefault: false } });
  }
  const account = await prisma.account.create({
    data: {
      name: body.name,
      accountType,
      initialBalance: Number(body.initialBalance ?? body.initial_balance ?? 0),
      color: meta.color,
      isDefault,
      includeInTotal: body.include_in_total !== false && body.includeInTotal !== false,
    },
  });
  return NextResponse.json({ ok: true, id: account.id, message: 'Account created' });
}
