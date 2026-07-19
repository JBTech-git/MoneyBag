import { Prisma } from '@prisma/client';
import { AuthError, requireUser } from './auth';
import { prisma } from './db';
import { getAccessState } from './subscription';
import { getSiteConfig } from './siteConfig';
import { isEmailSuperAdmin, isSuperAdmin, syncSuperAdminFlag } from './adminAccess';

export { isEmailSuperAdmin, isSuperAdmin, syncSuperAdminFlag, superAdminEmails } from './adminAccess';

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.disabledAt) {
    throw new AuthError('Account disabled', 403);
  }
  const synced = await syncSuperAdminFlag(user);
  if (!isSuperAdmin(synced)) {
    throw new AuthError('Super admin access required', 403);
  }
  return synced;
}

export async function getAdminStats() {
  const now = new Date();
  const [
    totalUsers,
    activeSubs,
    trialActive,
    trialExpired,
    disabled,
    admins,
    newLast7Days,
    txCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        subscriptionStatus: 'active',
        OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { gt: now } }],
      },
    }),
    prisma.user.count({
      where: {
        subscriptionStatus: { not: 'active' },
        trialEndsAt: { gt: now },
        disabledAt: null,
      },
    }),
    prisma.user.count({
      where: {
        AND: [
          { OR: [{ subscriptionStatus: { not: 'active' } }, { subscriptionEndsAt: { lte: now } }] },
          { trialEndsAt: { lte: now } },
          { disabledAt: null },
        ],
      },
    }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.user.count({ where: { isAdmin: true } }),
    prisma.user.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.transaction.count(),
  ]);

  return {
    total_users: totalUsers,
    active_subscriptions: activeSubs,
    trial_active: trialActive,
    trial_expired: trialExpired,
    disabled_users: disabled,
    admins,
    new_last_7_days: newLast7Days,
    total_transactions: txCount,
  };
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  disabled: boolean;
  subscription_status: string;
  access_status: string;
  trial_ends_at: string;
  subscription_ends_at: string | null;
  created_at: string;
  counts: {
    accounts: number;
    transactions: number;
  };
};

export async function listAdminUsers(opts: {
  q?: string;
  status?: string;
  take?: number;
  skip?: number;
}): Promise<{ users: AdminUserRow[]; total: number }> {
  const take = Math.min(opts.take || 50, 100);
  const skip = opts.skip || 0;
  const q = opts.q?.trim().toLowerCase();
  const now = new Date();

  const baseWhere: Prisma.UserWhereInput = {};
  if (q) {
    baseWhere.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (opts.status === 'active') {
    baseWhere.subscriptionStatus = 'active';
    baseWhere.AND = [
      ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : []),
      { OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { gt: now } }] },
    ];
  } else if (opts.status === 'trial') {
    baseWhere.trialEndsAt = { gt: now };
    baseWhere.subscriptionStatus = { not: 'active' };
    baseWhere.disabledAt = null;
  } else if (opts.status === 'expired') {
    baseWhere.disabledAt = null;
    baseWhere.AND = [
      ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : []),
      { trialEndsAt: { lte: now } },
      {
        OR: [
          { subscriptionStatus: { not: 'active' } },
          { subscriptionEndsAt: { lte: now } },
        ],
      },
    ];
  } else if (opts.status === 'disabled') {
    baseWhere.disabledAt = { not: null };
  } else if (opts.status === 'admin') {
    baseWhere.isAdmin = true;
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where: baseWhere }),
    prisma.user.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        _count: { select: { accounts: true, transactions: true } },
      },
    }),
  ]);

  const users: AdminUserRow[] = rows.map((u) => {
    const access = getAccessState(u);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      is_admin: u.isAdmin || isEmailSuperAdmin(u.email),
      disabled: Boolean(u.disabledAt),
      subscription_status: u.subscriptionStatus,
      access_status: u.disabledAt ? 'disabled' : access.status,
      trial_ends_at: u.trialEndsAt.toISOString(),
      subscription_ends_at: u.subscriptionEndsAt?.toISOString() ?? null,
      created_at: u.createdAt.toISOString(),
      counts: {
        accounts: u._count.accounts,
        transactions: u._count.transactions,
      },
    };
  });

  return { users, total };
}

export async function runAdminUserAction(
  actorId: string,
  userId: string,
  action: string,
  days?: number,
) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AuthError('User not found', 404);
  if (target.id === actorId && (action === 'delete' || action === 'disable' || action === 'remove_admin')) {
    throw new AuthError('You cannot do that to your own account', 400);
  }

  switch (action) {
    case 'extend_trial': {
      const site = await getSiteConfig();
      const addDays = days && days > 0 ? days : site.trialDays;
      const base = target.trialEndsAt.getTime() > Date.now() ? target.trialEndsAt : new Date();
      const trialEndsAt = new Date(base);
      trialEndsAt.setDate(trialEndsAt.getDate() + addDays);
      return prisma.user.update({
        where: { id: userId },
        data: {
          trialEndsAt,
          subscriptionStatus: 'trial',
          disabledAt: null,
        },
      });
    }
    case 'activate': {
      const site = await getSiteConfig();
      const addDays = days && days > 0 ? days : site.subscriptionDays;
      const subscriptionEndsAt = (() => {
        const d = new Date();
        d.setDate(d.getDate() + addDays);
        return d;
      })();
      return prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'active',
          subscriptionEndsAt,
          disabledAt: null,
        },
      });
    }
    case 'revoke': {
      return prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'expired',
          subscriptionEndsAt: new Date(),
          trialEndsAt: new Date(Date.now() - 60_000),
        },
      });
    }
    case 'make_admin': {
      return prisma.user.update({
        where: { id: userId },
        data: { isAdmin: true },
      });
    }
    case 'remove_admin': {
      if (isEmailSuperAdmin(target.email)) {
        throw new AuthError('Cannot remove admin for SUPER_ADMIN_EMAILS entry', 400);
      }
      return prisma.user.update({
        where: { id: userId },
        data: { isAdmin: false },
      });
    }
    case 'disable': {
      return prisma.user.update({
        where: { id: userId },
        data: { disabledAt: new Date() },
      });
    }
    case 'enable': {
      return prisma.user.update({
        where: { id: userId },
        data: { disabledAt: null },
      });
    }
    case 'delete': {
      if (isEmailSuperAdmin(target.email)) {
        throw new AuthError('Cannot delete a SUPER_ADMIN_EMAILS account', 400);
      }
      await deleteUserPermanently(target.id, target.email);
      return null;
    }
    default:
      throw new AuthError('Unknown action', 400);
  }
}

/** Remove the user and every related row (wallets, txns, budgets, claims, OTP codes, …). */
export async function deleteUserPermanently(userId: string, email: string) {
  // Neon + many related tables: use DB cascades on user delete (fast), with a longer timeout.
  await prisma.$transaction(
    async (tx) => {
      await tx.emailVerification.deleteMany({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      // Cascades wipe accounts, transactions, incomes, expenses, templates, claims, settings, …
      await tx.user.delete({ where: { id: userId } });
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}
