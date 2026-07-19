import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth';
import { requireSuperAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireSuperAdmin();
    const claim = await prisma.paymentClaim.findUnique({
      where: { id: params.id },
      select: { id: true, proofData: true },
    });
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }
    if (!claim.proofData) {
      return NextResponse.json({ error: 'No proof uploaded' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      claim_id: claim.id,
      proof_data: claim.proofData,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin payment-claim proof error', err);
    return NextResponse.json({ error: 'Failed to load proof' }, { status: 500 });
  }
}
