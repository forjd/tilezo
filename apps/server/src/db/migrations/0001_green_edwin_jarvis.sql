ALTER TABLE "users" ADD COLUMN "username_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
UPDATE "users" SET "username_key" = lower("username"), "password_hash" = 'legacy-user-without-password';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY "username_key"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add users_username_key_unique while duplicate username_key values exist; resolve duplicates manually before rerunning migrations';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_key_unique" UNIQUE("username_key");
