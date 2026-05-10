ALTER TABLE "users" ADD COLUMN "username_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
UPDATE "users" SET "username_key" = lower("username"), "password_hash" = 'legacy-user-without-password';--> statement-breakpoint
DELETE FROM "users"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "username_key"
        ORDER BY "created_at", "id"
      ) AS "duplicate_rank"
    FROM "users"
  ) "ranked_users"
  WHERE "duplicate_rank" > 1
);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_key_unique" UNIQUE("username_key");
