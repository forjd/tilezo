CREATE TABLE "user_playtime_rewards" (
	"user_id" text PRIMARY KEY NOT NULL,
	"accrued_active_ms" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone,
	"last_accrued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_playtime_rewards_accrued_active_ms_check" CHECK ("user_playtime_rewards"."accrued_active_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_playtime_rewards" ADD CONSTRAINT "user_playtime_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;