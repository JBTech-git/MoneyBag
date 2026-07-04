const CODE_TTL_MINUTES = 10;

export function verificationExpiresAt() {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + CODE_TTL_MINUTES);
  return expires;
}

export function useDevVerificationCode() {
  return process.env.NODE_ENV === 'development' || process.env.SHOW_DEV_CODE === 'true';
}

export async function sendVerificationEmail(email: string, code: string) {
  if (useDevVerificationCode()) {
    console.log(`[Moneybag] Verification code for ${email}: ${code}`);
    return { sent: false as const, devCode: code };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Moneybag <onboarding@resend.dev>';

  if (!apiKey) {
    throw new Error('Email is not configured. Set RESEND_API_KEY or SHOW_DEV_CODE=true for local testing.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your Moneybag sign-in code`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 12px;color:#1E3A8A">Moneybag</h2>
          <p style="color:#374151;line-height:1.5">Use this code to sign in. It expires in ${CODE_TTL_MINUTES} minutes.</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827">${code}</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Moneybag] Resend error:', err);
    throw new Error(
      'Could not send email. Verify your domain on Resend, or set SHOW_DEV_CODE=true for local testing.',
    );
  }

  return { sent: true as const };
}
