import { NextResponse } from 'next/server';
import { getSubscriptionConfig } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getSubscriptionConfig());
}
