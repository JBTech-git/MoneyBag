import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await getAuthPayload();
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: payload.id,
      email: payload.email,
      name: payload.name,
    },
    access: payload.access,
    trial_days: TRIAL_DAYS,
  });
}
