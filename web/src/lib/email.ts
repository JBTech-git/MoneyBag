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

function resolveFromAddress() {
  const configured = process.env.EMAIL_FROM?.trim();
  if (!configured) return RESEND_SANDBOX_FROM;

  const domain = configured.match(/@([\w.-]+)/i)?.[1]?.toLowerCase();
  if (domain && PUBLIC_MAILBOX_DOMAINS.has(domain)) {
    console.warn(
      `[Moneybag] EMAIL_FROM cannot use ${domain} on Resend. Sending from ${RESEND_SANDBOX_FROM} with reply-to ${supportEmail()}.`,
    );
    return RESEND_SANDBOX_FROM;
  }

  // Plain address without display name
  if (configured.includes('@') && !configured.includes('<')) {
    return `Moneybag <${configured}>`;
  }

  return configured;
}

function fallbackDelivery(email: string, code: string, reason: string) {
  console.warn(`[Moneybag] Email fallback for ${email}: ${reason}`);
  return { sent: false as const, devCode: code };
}

export async function sendVerificationEmail(email: string, code: string) {
  if (devVerificationEnabled()) {
    console.log(`[Moneybag] Verification code for ${email}: ${code}`);
    return { sent: false as const, devCode: code };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (emailCodeFallbackEnabled()) {
      return fallbackDelivery(email, code, 'RESEND_API_KEY is not set');
    }
    throw new Error('Email is not configured. Set RESEND_API_KEY on Vercel.');
  }

  const from = resolveFromAddress();
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
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 12px;color:#1E3A8A">Moneybag</h2>
          <p style="color:#374151;line-height:1.5">Use this code to sign in. It expires in ${CODE_TTL_MINUTES} minutes.</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827">${code}</p>
          <p style="color:#6b7280;font-size:12px;margin-top:16px">Questions? Reply to this email or contact ${replyTo}</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Moneybag] Resend error:', err);

    if (emailCodeFallbackEnabled() || devVerificationEnabled()) {
      return fallbackDelivery(email, code, err);
    }

    throw new Error(
      `Could not send email. Use EMAIL_FROM="Moneybag <onboarding@resend.dev>" on Vercel (not Gmail). Support: ${replyTo}`,
    );
  }

  return { sent: true as const };
}
