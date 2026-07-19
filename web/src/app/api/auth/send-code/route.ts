import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, sendEmailVerificationCode } from '@/lib/auth';
import { assertRateLimit, clientIp, hashKey } from '@/lib/rateLimit';
import { canExposeDevCode } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const ip = clientIp(req);

    assertRateLimit({
      key: `send-code:ip:${hashKey(ip)}`,
      limit: 20,
      windowMs: 60 * 60 * 1000,
      errorMessage: 'Too many requests from this network. Try again later.',
    });
    if (email) {
      assertRateLimit({
        key: `send-code:email:${hashKey(email)}`,
        limit: 5,
        windowMs: 15 * 60 * 1000,
        errorMessage: 'Too many codes for this email. Wait a few minutes.',
      });
    }

    const result = await sendEmailVerificationCode(email);
    if ('error' in result && result.error && !result.sent && !('devCode' in result && result.devCode)) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    const exposeCode = canExposeDevCode() && 'devCode' in result && result.devCode;
    return NextResponse.json({
      ok: true,
      email: result.email,
      message: result.message,
      sent: result.sent,
      ...(exposeCode
        ? {
            dev_code: result.devCode,
            email_fallback: 'emailFallback' in result ? result.emailFallback : false,
          }
        : {}),
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
    console.error('send-code error', err);
    const message = err instanceof Error ? err.message : 'Could not send code';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
