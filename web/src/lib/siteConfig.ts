import type { Prisma, SiteConfig } from '@prisma/client';
import { prisma } from './db';

export type SiteConfigInput = {
  trialDays?: number;
  subscriptionDays?: number;
  priceLabel?: string;
  allowDemoSubscription?: boolean;
  phonepeEnabled?: boolean;
  phonepeUpiId?: string;
  phonepeQrImage?: string;
  phonepeQrData?: string | null;
  paymentAutoActivate?: boolean;
  phonepeInstructions?: string;
  appUrl?: string;
};

function builtInDefaults(): Omit<SiteConfig, 'id' | 'updatedAt'> {
  return {
    trialDays: 30,
    subscriptionDays: 30,
    priceLabel: '₹99/month',
    allowDemoSubscription: false,
    phonepeEnabled: true,
    phonepeUpiId: '',
    phonepeQrImage: '/payments/phonepe-qr.svg',
    phonepeQrData: '',
    paymentAutoActivate: false,
    phonepeInstructions: '',
    appUrl: '',
  };
}

/** Load singleton site config; seed with built-in defaults on first access. */
export async function getSiteConfig(): Promise<SiteConfig> {
  const existing = await prisma.siteConfig.findUnique({ where: { id: 1 } });
  if (existing) return existing;

  const defaults = builtInDefaults();
  try {
    return await prisma.siteConfig.create({
      data: { id: 1, ...defaults },
    });
  } catch {
    const again = await prisma.siteConfig.findUnique({ where: { id: 1 } });
    if (again) return again;
    throw new Error('Could not load site config');
  }
}

export async function updateSiteConfig(input: SiteConfigInput): Promise<SiteConfig> {
  await getSiteConfig();

  const data: Prisma.SiteConfigUpdateInput = {};
  if (input.trialDays !== undefined) {
    data.trialDays = Math.min(3650, Math.max(1, Math.floor(Number(input.trialDays) || 1)));
  }
  if (input.subscriptionDays !== undefined) {
    data.subscriptionDays = Math.min(3650, Math.max(1, Math.floor(Number(input.subscriptionDays) || 1)));
  }
  if (input.priceLabel !== undefined) {
    data.priceLabel = String(input.priceLabel).trim().slice(0, 80) || '₹99/month';
  }
  if (input.allowDemoSubscription !== undefined) {
    data.allowDemoSubscription = Boolean(input.allowDemoSubscription);
  }
  if (input.phonepeEnabled !== undefined) {
    data.phonepeEnabled = Boolean(input.phonepeEnabled);
  }
  if (input.phonepeUpiId !== undefined) {
    data.phonepeUpiId = String(input.phonepeUpiId).trim().slice(0, 120);
  }
  if (input.phonepeQrImage !== undefined) {
    data.phonepeQrImage = String(input.phonepeQrImage).trim().slice(0, 300) || '/payments/phonepe-qr.svg';
  }
  if (input.phonepeQrData !== undefined) {
    const raw = input.phonepeQrData === null ? '' : String(input.phonepeQrData);
    if (raw && !raw.startsWith('data:image/')) {
      throw new Error('QR upload must be an image');
    }
    if (raw.length > 900_000) {
      throw new Error('QR image is too large (max ~650KB)');
    }
    data.phonepeQrData = raw;
  }
  if (input.paymentAutoActivate !== undefined) {
    data.paymentAutoActivate = Boolean(input.paymentAutoActivate);
  }
  if (input.phonepeInstructions !== undefined) {
    data.phonepeInstructions = String(input.phonepeInstructions).trim().slice(0, 500);
  }
  if (input.appUrl !== undefined) {
    data.appUrl = String(input.appUrl).trim().slice(0, 300);
  }

  return prisma.siteConfig.update({
    where: { id: 1 },
    data,
  });
}

export function serializeSiteConfig(row: SiteConfig) {
  return {
    trial_days: row.trialDays,
    subscription_days: row.subscriptionDays,
    price_label: row.priceLabel,
    allow_demo_subscription: row.allowDemoSubscription,
    phonepe_enabled: row.phonepeEnabled,
    phonepe_upi_id: row.phonepeUpiId,
    phonepe_qr_image: row.phonepeQrImage,
    phonepe_qr_data: row.phonepeQrData,
    phonepe_qr_preview: row.phonepeQrData || row.phonepeQrImage,
    payment_auto_activate: row.paymentAutoActivate,
    phonepe_instructions: row.phonepeInstructions,
    app_url: row.appUrl,
    updated_at: row.updatedAt.toISOString(),
  };
}
