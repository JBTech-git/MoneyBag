import type { User } from '@prisma/client';
import { prisma } from './db';

export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailSuperAdmin(email: string) {
  return superAdminEmails().includes(email.trim().toLowerCase());
}

export function isSuperAdmin(user: Pick<User, 'email' | 'isAdmin'>) {
  return Boolean(user.isAdmin) || isEmailSuperAdmin(user.email);
}

/** Promote env-listed admins in DB when they sign in. */
export async function syncSuperAdminFlag(user: User) {
  if (isEmailSuperAdmin(user.email) && !user.isAdmin) {
    return prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
    });
  }
  return user;
}
