import { NextResponse } from 'next/server';
import {
  activateSubscription,
  authErrorResponse,
  isDemoSubscriptionAllowed,
  requireUser,
} from '@/lib/auth';
import { serializeAccess } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await requireUser();

    if (!(await isDemoSubscriptionAllowed())) {
      return NextResponse.json(
        {
          error: 'Demo subscribe is disabled. Pay with PhonePe or contact support.',
          code: 'payment_not_configured',
        },
        { status: 503 },
      );
    }

    const updated = await activateSubscription(user.id);
    return NextResponse.json({
      ok: true,
      message: 'Subscription activated',
      access: serializeAccess(updated),
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('subscription activate error', err);
    return NextResponse.json({ error: 'Could not activate subscription' }, { status: 500 });
  }
}
