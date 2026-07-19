import { randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { sendVerificationEmail, verificationExpiresAt } from './email';
import {
  getAccessState,
  serializeAccess,
  subscriptionEndsAtFromNow,
  trialEndsAtFromNow,
} from './subscription';
import { getSiteConfig } from './siteConfig';
import { isEmailSuperAdmin, isSuperAdmin, syncSuperAdminFlag } from './adminAccess';

const COOKIE_NAME = 'moneybag_session';
const SESSION_DAYS = 30;

function sessionSecret() {
  const secret =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === 'development' ? 'moneybag-dev-secret-change-me' : '');
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin?: boolean;
};

export type AuthPayload = SessionUser & {
  access: ReturnType<typeof serializeAccess>;
};

function sanitizeUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: Boolean(user.isAdmin) || isEmailSuperAdmin(user.email),
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

export async function hashVerificationCode(code: string) {
  return bcrypt.hash(code, 10);
}

export async function checkVerificationCode(code: string, codeHash: string) {
  return bcrypt.compare(code, codeHash);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionToken() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const id = payload.sub;
    const email = payload.email;
    if (typeof id !== 'string' || typeof email !== 'string') return null;
    return {
      id,
      email,
      name: typeof payload.name === 'string' ? payload.name : '',
    } satisfies SessionUser;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await readSessionToken();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return null;
  if (user.disabledAt) return null;
  return syncSuperAdminFlag(user);
}

export async function getAuthPayload(): Promise<AuthPayload | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    ...sanitizeUser(user),
    access: serializeAccess(user),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('Sign in required', 401);
  }
  return user;
}

export async function requireManageAccess() {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    return user;
  }
  const access = getAccessState(user);
  if (!access.hasAccess) {
    throw new AuthError('Trial expired. Subscribe to continue.', 402);
  }
  return user;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}

async function findUserByEmail(email: string) {
  // Case-insensitive so User@Mail.com and user@mail.com are the same account
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
}

async function findOrCreateUser(email: string) {
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.disabledAt) {
      throw new AuthError('This account has been disabled. Contact support.', 403);
    }
    // Keep stored email normalized to lowercase for future exact lookups
    let user = existing;
    if (existing.email !== email) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: { email },
      });
    }
    const synced = await syncSuperAdminFlag(user);
    return { user: synced, isNew: false };
  }

  const site = await getSiteConfig();
  const trialEndsAt = trialEndsAtFromNow(site.trialDays);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: null,
        name: email.split('@')[0] || 'User',
        isAdmin: isEmailSuperAdmin(email),
        trialEndsAt,
        subscriptionStatus: 'trial',
        settings: {
          create: {
            currencyCode: 'INR',
            currencySymbol: '₹',
            theme: 'light',
          },
        },
        accounts: {
          create: {
            name: 'Cash',
            accountType: 'cash',
            isDefault: true,
            color: '#0F766E',
          },
        },
      },
    });
    return { user, isNew: true };
  } catch (err) {
    // Race: another request created the same email — sign in to that user
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : '';
    if (code === 'P2002') {
      const raced = await findUserByEmail(email);
      if (raced) {
        if (raced.disabledAt) {
          throw new AuthError('This account has been disabled. Contact support.', 403);
        }
        const synced = await syncSuperAdminFlag(raced);
        return { user: synced, isNew: false };
      }
    }
    throw err;
  }
}

export async function sendEmailVerificationCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new AuthError('Enter a valid email address', 400);
  }

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);
  const expiresAt = verificationExpiresAt();

  await prisma.emailVerification.deleteMany({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  await prisma.emailVerification.create({
    data: { email, codeHash, expiresAt },
  });

  const existing = await findUserByEmail(email);
  const delivery = await sendVerificationEmail(email, code);
  return {
    email,
    message: existing ? 'Sign-in code sent' : 'Verification code sent',
    isNewHint: !existing,
    ...delivery,
  };
}

export async function verifyEmailCode(rawEmail: string, rawCode: string) {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();

  if (!isValidEmail(email)) {
    throw new AuthError('Enter a valid email address', 400);
  }
  if (!/^\d{6}$/.test(code)) {
    throw new AuthError('Enter the 6-digit code from your email', 400);
  }

  const record = await prisma.emailVerification.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw new AuthError('No code found. Request a new one.', 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.emailVerification.delete({ where: { id: record.id } });
    throw new AuthError('Code expired. Request a new one.', 400);
  }
  if (!(await checkVerificationCode(code, record.codeHash))) {
    throw new AuthError('Invalid code. Try again.', 400);
  }

  await prisma.emailVerification.deleteMany({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  const { user, isNew } = await findOrCreateUser(email);
  return { user, isNew };
}

export async function activateSubscription(userId: string) {
  const site = await getSiteConfig();
  const subscriptionEndsAt = subscriptionEndsAtFromNow(site.subscriptionDays);
  return prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'active',
      subscriptionEndsAt,
    },
  });
}

export async function isDemoSubscriptionAllowed() {
  const site = await getSiteConfig();
  return site.allowDemoSubscription;
}
