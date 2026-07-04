import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  createSessionToken,
  setSessionCookie,
  verifyEmailCode,
} from '@/lib/auth';
import { serializeAccess, TRIAL_DAYS } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user, isNew } = await verifyEmailCode(body.email || '', body.code || '');
    const sessionUser = { id: user.id, email: user.email, name: user.name };
    const token = await createSessionToken(sessionUser);
    const res = NextResponse.json({
      ok: true,
      user: sessionUser,
      access: serializeAccess(user),
      message: isNew
        ? `Welcome! You have ${TRIAL_DAYS} day${TRIAL_DAYS === 1 ? '' : 's'} free.`
        : 'Signed in',
    });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('verify-code error', err);
    return NextResponse.json({ error: 'Could not verify code' }, { status: 500 });
  }
}
