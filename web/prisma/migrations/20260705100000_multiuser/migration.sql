-- Multi-user + trial migration (existing databases)

CREATE TABLE IF NOT EXISTS "users" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "incomes" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

UPDATE "accounts" SET "user_id" = 'legacy-migrated-user' WHERE "user_id" IS NULL;
UPDATE "incomes" SET "user_id" = 'legacy-migrated-user' WHERE "user_id" IS NULL;
UPDATE "expenses" SET "user_id" = 'legacy-migrated-user' WHERE "user_id" IS NULL;
UPDATE "transactions" SET "user_id" = 'legacy-migrated-user' WHERE "user_id" IS NULL;
UPDATE "app_settings" SET "user_id" = 'legacy-migrated-user' WHERE "user_id" IS NULL;

ALTER TABLE "accounts" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "incomes" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "app_settings" ALTER COLUMN "user_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_user_id_key" ON "app_settings"("user_id");
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts"("user_id");
CREATE INDEX IF NOT EXISTS "incomes_user_id_idx" ON "incomes"("user_id");
CREATE INDEX IF NOT EXISTS "expenses_user_id_idx" ON "expenses"("user_id");
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions"("user_id");

DO $$ BEGIN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
