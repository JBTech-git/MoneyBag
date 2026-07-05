import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, sendEmailVerificationCode } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await sendEmailVerificationCode(body.email || '');
    return NextResponse.json({
      ok: true,
      email: result.email,
      message: result.message,
      dev_code: result.devCode,
      email_fallback: 'emailFallback' in result ? result.emailFallback : false,
      sent: result.sent,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('send-code error', err);
    const message = err instanceof Error ? err.message : 'Could not send code';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
