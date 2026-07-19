import { createHash } from 'crypto';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 500) return;
  buckets.forEach((value, key) => {
    if (value.resetAt <= now) buckets.delete(key);
  });
}

/** Simple in-memory rate limit (per server instance). Good enough for Vercel cold starts + small apps. */
export function assertRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  errorMessage?: string;
}) {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  if (existing.count >= opts.limit) {
    const err = new Error(
      opts.errorMessage || 'Too many attempts. Please wait and try again.',
    ) as Error & { status: number };
    err.status = 429;
    throw err;
  }
  existing.count += 1;
}

export function clientIp(req: { headers: Headers }) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function hashKey(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}
