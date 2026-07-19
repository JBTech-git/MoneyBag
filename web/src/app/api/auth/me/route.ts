import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/lib/auth';
import { getSiteConfig } from '@/lib/siteConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await getAuthPayload();
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const site = await getSiteConfig();
  return NextResponse.json({
    authenticated: true,
    user: {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      isAdmin: Boolean(payload.isAdmin),
    },
    access: payload.access,
    trial_days: site.trialDays,
  });
}
