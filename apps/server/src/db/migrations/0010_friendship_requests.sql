ALTER TABLE "friendships" ADD COLUMN "requested_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "friendships" ADD COLUMN "status" text DEFAULT 'accepted' NOT NULL;
--> statement-breakpoint
UPDATE "friendships" SET "requested_by_user_id" = "user_id" WHERE "requested_by_user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "friendships" ALTER COLUMN "requested_by_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "friendships" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted'));
--> statement-breakpoint
CREATE INDEX "friendships_status_idx" ON "friendships" USING btree ("status");
