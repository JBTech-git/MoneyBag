import { NextRequest, NextResponse } from 'next/server';
import { activateSubscription, authErrorResponse, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notifySuperAdminsPayment } from '@/lib/email';
import { assertRateLimit, hashKey } from '@/lib/rateLimit';
import { getSubscriptionConfig, serializeAccess } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeProof(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (!value.startsWith('data:image/')) {
    throw new Error('Payment proof must be an image');
  }
  if (value.length > 900_000) {
    throw new Error('Payment proof is too large (max ~650KB)');
  }
  return value;
}

function normalizeUtr(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const config = await getSubscriptionConfig();
    const utr = normalizeUtr(body.utr);
    const note = String(body.note || '').trim().slice(0, 300);

    assertRateLimit({
      key: `claim-payment:${hashKey(user.id)}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      errorMessage: 'Too many payment claims. Wait and try again.',
    });

    if (!config.phonepe.enabled) {
      return NextResponse.json({ error: 'PhonePe payments are not configured' }, { status: 503 });
    }
    if (utr.length < 8 || !/^[A-Z0-9\-]+$/.test(utr)) {
      return NextResponse.json(
        { error: 'Enter a valid PhonePe / UPI UTR (at least 8 characters)' },
        { status: 400 },
      );
    }

    let proofData = '';
    try {
      proofData = normalizeProof(body.proof_data);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid payment proof' },
        { status: 400 },
      );
    }

    const duplicate = await prisma.paymentClaim.findFirst({
      where: {
        utr,
        status: { in: ['pending', 'activated'] },
      },
      select: { id: true, userId: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'This UTR was already submitted. Contact support if this is a mistake.' },
        { status: 409 },
      );
    }

    const pendingCount = await prisma.paymentClaim.count({
      where: { userId: user.id, status: 'pending' },
    });
    if (pendingCount >= 3) {
      return NextResponse.json(
        { error: 'You already have pending claims. Wait for admin review.' },
        { status: 429 },
      );
    }

    // Secure default: never auto-activate unless Super Admin explicitly enables it.
    const autoActivate = config.phonepe.autoActivate === true;
    const claim = await prisma.paymentClaim.create({
      data: {
        userId: user.id,
        amountLabel: config.priceLabel,
        utr,
        note,
        proofData,
        status: autoActivate ? 'activated' : 'pending',
        reviewedAt: autoActivate ? new Date() : null,
        reviewNote: autoActivate ? 'Auto-activated on claim' : '',
      },
    });

    let access = serializeAccess(user);
    if (autoActivate) {
      const updated = await activateSubscription(user.id);
      access = serializeAccess(updated);
    }

    const origin =
      config.appUrl ||
      process.env.APP_URL?.trim() ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    await notifySuperAdminsPayment({
      userEmail: user.email,
      userName: user.name,
      amountLabel: config.priceLabel,
      utr,
      note,
      hasProof: Boolean(proofData),
      autoActivated: autoActivate,
      adminUrl: `${origin}/admin`,
    });

    return NextResponse.json({
      ok: true,
      claim_id: claim.id,
      auto_activated: autoActivate,
      access,
      message: autoActivate
        ? 'Payment recorded. Your subscription is now active.'
        : 'Payment recorded. Super admin will review and activate your access shortly.',
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Too many requests' },
        { status: 429 },
      );
    }
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('claim-payment error', err);
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 });
  }
}
