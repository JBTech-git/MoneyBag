import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth';
import { requireSuperAdmin } from '@/lib/admin';
import {
  getSiteConfig,
  serializeSiteConfig,
  updateSiteConfig,
} from '@/lib/siteConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperAdmin();
    const site = await getSiteConfig();
    return NextResponse.json({ ok: true, settings: serializeSiteConfig(site) });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin site-config GET error', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const site = await updateSiteConfig({
      trialDays: body.trial_days,
      subscriptionDays: body.subscription_days,
      priceLabel: body.price_label,
      allowDemoSubscription: body.allow_demo_subscription,
      phonepeEnabled: body.phonepe_enabled,
      phonepeUpiId: body.phonepe_upi_id,
      phonepeQrImage: body.phonepe_qr_image,
      phonepeQrData: body.clear_qr ? '' : body.phonepe_qr_data,
      paymentAutoActivate: body.payment_auto_activate,
      phonepeInstructions: body.phonepe_instructions,
      appUrl: body.app_url,
    });
    return NextResponse.json({
      ok: true,
      message: 'Settings saved',
      settings: serializeSiteConfig(site),
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    console.error('admin site-config PUT error', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
