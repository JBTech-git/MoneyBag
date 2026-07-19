import { NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { localDateIso } from '@/lib/dates';
import { toNum } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  try {
    const user = await requireUser();
    const txs = await prisma.transaction.findMany({
      where: { userId: user.id },
      include: { account: true, toAccount: true },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      take: 5000,
    });

    const header = ['Date', 'Type', 'Category', 'Amount', 'From', 'To', 'Memo'];
    const lines = [header.join(',')];
    for (const t of txs) {
      lines.push(
        [
          localDateIso(t.transactionDate),
          t.transactionType,
          csvEscape(t.categoryName),
          toNum(t.amount).toFixed(2),
          csvEscape(t.account.name),
          csvEscape(t.toAccount?.name || ''),
          csvEscape(t.memo || ''),
        ].join(','),
      );
    }

    const body = lines.join('\n');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="moneybag-transactions.csv"`,
      },
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not export' }, { status: 500 });
  }
}
