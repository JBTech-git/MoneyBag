/**
 * One-time migration for existing Moneybag databases.
 * Creates a legacy user and assigns all rows to it.
 *
 * Usage: node scripts/migrate-multiuser.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const LEGACY_ID = 'legacy-migrated-user';
const LEGACY_EMAIL = 'legacy@moneybag.local';
const LEGACY_PASSWORD = 'LegacyReset123!';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(LEGACY_PASSWORD, 12);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 2);

  await prisma.user.upsert({
    where: { id: LEGACY_ID },
    create: {
      id: LEGACY_ID,
      email: LEGACY_EMAIL,
      passwordHash,
      name: 'Legacy User',
      trialEndsAt,
      subscriptionStatus: 'trial',
    },
    update: {},
  });

  await prisma.$executeRawUnsafe(`UPDATE accounts SET user_id = '${LEGACY_ID}' WHERE user_id IS NULL`);
  await prisma.$executeRawUnsafe(`UPDATE incomes SET user_id = '${LEGACY_ID}' WHERE user_id IS NULL`);
  await prisma.$executeRawUnsafe(`UPDATE expenses SET user_id = '${LEGACY_ID}' WHERE user_id IS NULL`);
  await prisma.$executeRawUnsafe(`UPDATE transactions SET user_id = '${LEGACY_ID}' WHERE user_id IS NULL`);
  await prisma.$executeRawUnsafe(`UPDATE app_settings SET user_id = '${LEGACY_ID}' WHERE user_id IS NULL`);

  console.log('Migration complete.');
  console.log(`Sign in with ${LEGACY_EMAIL} / ${LEGACY_PASSWORD} to access existing data.`);
  console.log('Create a new account for a fresh trial.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
