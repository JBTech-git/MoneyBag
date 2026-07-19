import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorResponse,
  createSessionToken,
  setSessionCookie,
  verifyEmailCode,
} from '@/lib/auth';
import { isEmailSuperAdmin } from '@/lib/adminAccess';
import { assertRateLimit, clientIp, hashKey } from '@/lib/rateLimit';
import { getSiteConfig } from '@/lib/siteConfig';
import { serializeAccess } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const ip = clientIp(req);

    assertRateLimit({
      key: `verify-code:ip:${hashKey(ip)}`,
      limit: 40,
      windowMs: 60 * 60 * 1000,
      errorMessage: 'Too many sign-in attempts from this network. Try again later.',
    });
    if (email) {
      assertRateLimit({
        key: `verify-code:email:${hashKey(email)}`,
        limit: 10,
        windowMs: 15 * 60 * 1000,
        errorMessage: 'Too many invalid codes. Request a new code and try again later.',
      });
    }

    const { user, isNew } = await verifyEmailCode(email, body.code || '');
    const site = await getSiteConfig();
    const sessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: Boolean(user.isAdmin) || isEmailSuperAdmin(user.email),
    };
    const token = await createSessionToken(sessionUser);
    const trialDays = site.trialDays;
    const res = NextResponse.json({
      ok: true,
      user: sessionUser,
      access: serializeAccess(user),
      message: isNew
        ? `Welcome! You have ${trialDays} day${trialDays === 1 ? '' : 's'} free.`
        : 'Welcome back — signed in',
    });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Too many requests' },
        { status: 429 },
      );
    }
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('verify-code error', err);
    return NextResponse.json({ error: 'Could not verify code' }, { status: 500 });
  }
}
