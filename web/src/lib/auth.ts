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
  TRIAL_DAYS,
} from './subscription';

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
};

export type AuthPayload = SessionUser & {
  access: ReturnType<typeof serializeAccess>;
};

function sanitizeUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
  return prisma.user.findUnique({ where: { id: session.id } });
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

async function findOrCreateUser(email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { user: existing, isNew: false };

  const trialEndsAt = trialEndsAtFromNow(TRIAL_DAYS);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      name: email.split('@')[0] || 'User',
      trialEndsAt,
      subscriptionStatus: 'trial',
      settings: {
        create: {
          currencyCode: 'INR',
          currencySymbol: '₹',
          theme: 'dark',
        },
      },
      accounts: {
        create: {
          name: 'Cash',
          accountType: 'cash',
          isDefault: true,
          color: '#1E3A8A',
        },
      },
    },
  });
  return { user, isNew: true };
}

export async function sendEmailVerificationCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new AuthError('Enter a valid email address', 400);
  }

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);
  const expiresAt = verificationExpiresAt();

  await prisma.emailVerification.deleteMany({ where: { email } });
  await prisma.emailVerification.create({
    data: { email, codeHash, expiresAt },
  });

  const delivery = await sendVerificationEmail(email, code);
  return {
    email,
    message: 'Verification code sent',
    isNewHint: !(await prisma.user.findUnique({ where: { email } })),
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
    where: { email },
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

  await prisma.emailVerification.deleteMany({ where: { email } });
  const { user, isNew } = await findOrCreateUser(email);
  return { user, isNew };
}

export async function activateSubscription(userId: string) {
  const subscriptionEndsAt = subscriptionEndsAtFromNow();
  return prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'active',
      subscriptionEndsAt,
    },
  });
}

export function isDemoSubscriptionAllowed() {
  return process.env.ALLOW_DEMO_SUBSCRIPTION === 'true';
}
