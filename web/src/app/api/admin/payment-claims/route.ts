import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth';
import { requireSuperAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperAdmin();
    const claims = await prisma.paymentClaim.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json({
      claims: claims.map((c) => ({
        id: c.id,
        amount_label: c.amountLabel,
        utr: c.utr,
        note: c.note,
        status: c.status,
        has_proof: Boolean(c.proofData),
        review_note: c.reviewNote,
        reviewed_at: c.reviewedAt?.toISOString() ?? null,
        created_at: c.createdAt.toISOString(),
        user: {
          id: c.user.id,
          email: c.user.email,
          name: c.user.name,
        },
      })),
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin payment-claims error', err);
    return NextResponse.json({ error: 'Failed to load payment claims' }, { status: 500 });
  }
}
