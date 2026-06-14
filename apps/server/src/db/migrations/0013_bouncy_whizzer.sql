ALTER TABLE "direct_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "direct_messages_deleted_idx" ON "direct_messages" USING btree ("deleted_at");