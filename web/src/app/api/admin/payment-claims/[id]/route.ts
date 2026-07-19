import { NextRequest, NextResponse } from 'next/server';
import { activateSubscription, authErrorResponse } from '@/lib/auth';
import { requireSuperAdmin, runAdminUserAction } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const admin = await requireSuperAdmin();
    const body = await req.json();
    const action = String(body.action || '').trim();
    const reviewNote = String(body.review_note || '').trim().slice(0, 400);

    const claim = await prisma.paymentClaim.findUnique({
      where: { id: params.id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (action === 'approve') {
      if (claim.status === 'activated') {
        return NextResponse.json({ ok: true, message: 'Already activated', claim_id: claim.id });
      }
      await activateSubscription(claim.userId);
      const updated = await prisma.paymentClaim.update({
        where: { id: claim.id },
        data: {
          status: 'activated',
          reviewedAt: new Date(),
          reviewedById: admin.id,
          reviewNote: reviewNote || 'Approved by super admin',
        },
      });
      return NextResponse.json({
        ok: true,
        message: `Activated ${claim.user.email}`,
        claim: {
          id: updated.id,
          status: updated.status,
          review_note: updated.reviewNote,
          reviewed_at: updated.reviewedAt?.toISOString() ?? null,
        },
      });
    }

    if (action === 'reject') {
      if (claim.status === 'activated') {
        await runAdminUserAction(admin.id, claim.userId, 'revoke');
      }
      const updated = await prisma.paymentClaim.update({
        where: { id: claim.id },
        data: {
          status: 'rejected',
          reviewedAt: new Date(),
          reviewedById: admin.id,
          reviewNote: reviewNote || 'Rejected by super admin',
        },
      });
      return NextResponse.json({
        ok: true,
        message: claim.status === 'activated'
          ? `Rejected claim and revoked access for ${claim.user.email}`
          : `Rejected claim for ${claim.user.email}`,
        claim: {
          id: updated.id,
          status: updated.status,
          review_note: updated.reviewNote,
          reviewed_at: updated.reviewedAt?.toISOString() ?? null,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action. Use approve or reject.' }, { status: 400 });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin payment-claim action error', err);
    const message = err instanceof Error ? err.message : 'Action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
