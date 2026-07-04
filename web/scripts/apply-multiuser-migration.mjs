/**
 * Safe multi-user migration for existing Neon/local databases.
 * Adds nullable user_id columns, backfills a legacy user, then enforces NOT NULL.
 *
 * Usage: node scripts/apply-multiuser-migration.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const LEGACY_ID = 'legacy-migrated-user';
const LEGACY_EMAIL = 'legacy@moneybag.local';
const LEGACY_PASSWORD = 'LegacyReset123!';

const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}'
    LIMIT 1
  `);
  return Array.isArray(rows) && rows.length > 0;
}

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '${table}'
    LIMIT 1
  `);
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  if (!(await tableExists('users'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "users" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT '',
        "trial_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "trial_ends_at" TIMESTAMP(3) NOT NULL,
        "subscription_status" TEXT NOT NULL DEFAULT 'trial',
        "subscription_ends_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")`);
  }

  for (const table of ['accounts', 'incomes', 'expenses', 'transactions', 'app_settings']) {
    if (!(await columnExists(table, 'user_id'))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "user_id" TEXT`);
    }
  }

  const passwordHash = await bcrypt.hash(LEGACY_PASSWORD, 12);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 2);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "users" ("id", "email", "password_hash", "name", "trial_ends_at", "subscription_status", "updated_at")
    VALUES ('${LEGACY_ID}', '${LEGACY_EMAIL}', '${passwordHash}', 'Legacy User', '${trialEndsAt.toISOString()}', 'trial', CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING
  `);

  for (const table of ['accounts', 'incomes', 'expenses', 'transactions', 'app_settings']) {
    await prisma.$executeRawUnsafe(`
      UPDATE "${table}" SET "user_id" = '${LEGACY_ID}' WHERE "user_id" IS NULL
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "user_id" SET NOT NULL`);
  }

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_user_id_key" ON "app_settings"("user_id")`);
  for (const table of ['accounts', 'incomes', 'expenses', 'transactions']) {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_user_id_idx" ON "${table}"("user_id")`);
  }

  const fks = [
    ['accounts', 'accounts_user_id_fkey'],
    ['incomes', 'incomes_user_id_fkey'],
    ['expenses', 'expenses_user_id_fkey'],
    ['transactions', 'transactions_user_id_fkey'],
    ['app_settings', 'app_settings_user_id_fkey'],
  ];
  for (const [table, name] of fks) {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "${table}" ADD CONSTRAINT "${name}"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  console.log('Multi-user migration applied.');
  console.log(`Existing data owner: ${LEGACY_EMAIL} / ${LEGACY_PASSWORD}`);
  console.log('New users can sign up separately for a fresh 2-day trial.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
