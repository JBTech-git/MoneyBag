import nodemailer from 'nodemailer';

const CODE_TTL_MINUTES = 10;
const RESEND_SANDBOX_FROM = 'Moneybag <onboarding@resend.dev>';
const DEFAULT_REPLY_TO = 'info.mnybag@gmail.com';

const PUBLIC_MAILBOX_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
]);

export function verificationExpiresAt() {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + CODE_TTL_MINUTES);
  return expires;
}

export function devVerificationEnabled() {
  return process.env.NODE_ENV === 'development' || process.env.SHOW_DEV_CODE === 'true';
}

export function emailCodeFallbackEnabled() {
  return process.env.EMAIL_CODE_FALLBACK === 'true';
}

export function supportEmail() {
  return process.env.SUPPORT_EMAIL?.trim() || process.env.EMAIL_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
}

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

function formatFromAddress(configured: string | undefined, fallbackAddress: string) {
  const value = configured?.trim() || fallbackAddress;
  if (value.includes('@') && !value.includes('<')) {
    return `Moneybag <${value}>`;
  }
  return value;
}

function resolveSmtpFromAddress() {
  return formatFromAddress(process.env.EMAIL_FROM, process.env.SMTP_USER!.trim());
}

function resolveResendFromAddress() {
  const configured = process.env.EMAIL_FROM?.trim();
  if (!configured) return RESEND_SANDBOX_FROM;

  const domain = configured.match(/@([\w.-]+)/i)?.[1]?.toLowerCase();
  if (domain && PUBLIC_MAILBOX_DOMAINS.has(domain)) {
    console.warn(
      `[Moneybag] EMAIL_FROM cannot use ${domain} on Resend. Sending from ${RESEND_SANDBOX_FROM} with reply-to ${supportEmail()}.`,
    );
    return RESEND_SANDBOX_FROM;
  }

  return formatFromAddress(configured, configured);
}

function verificationEmailHtml(code: string) {
  const replyTo = supportEmail();
  return `
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 12px;color:#1E3A8A">Moneybag</h2>
      <p style="color:#374151;line-height:1.5">Use this code to sign in. It expires in ${CODE_TTL_MINUTES} minutes.</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827">${code}</p>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">Questions? Reply to this email or contact ${replyTo}</p>
    </div>
  `;
}

function fallbackDelivery(email: string, code: string, reason: string) {
  console.warn(`[Moneybag] Email fallback for ${email}: ${reason}`);
  return { sent: false as const, devCode: code, emailFallback: true as const };
}

async function sendViaSmtp(email: string, code: string) {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || '587');
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const from = resolveSmtpFromAddress();
  const replyTo = supportEmail();

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transport.sendMail({
    from,
    replyTo,
    to: email,
    subject: `${code} is your Moneybag sign-in code`,
    html: verificationEmailHtml(code),
  });

  return { sent: true as const };
}

async function sendViaResend(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set');
  }

  const from = resolveResendFromAddress();
  const replyTo = supportEmail();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [email],
      subject: `${code} is your Moneybag sign-in code`,
      html: verificationEmailHtml(code),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  return { sent: true as const };
}

export async function sendVerificationEmail(email: string, code: string) {
  if (devVerificationEnabled()) {
    console.log(`[Moneybag] Verification code for ${email}: ${code}`);
    return { sent: false as const, devCode: code, emailFallback: false as const };
  }

  if (smtpConfigured()) {
    try {
      return await sendViaSmtp(email, code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Moneybag] SMTP error:', message);
      return fallbackDelivery(email, code, message);
    }
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      return await sendViaResend(email, code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Moneybag] Resend error:', message);
      return fallbackDelivery(email, code, message);
    }
  }

  return fallbackDelivery(email, code, 'No email provider configured (set SMTP_* or RESEND_API_KEY)');
}
