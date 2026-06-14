CREATE TABLE "blocked_users" (
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_users_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id"),
	CONSTRAINT "blocked_users_no_self_check" CHECK ("blocked_users"."blocker_user_id" <> "blocked_users"."blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_user_id_idx" ON "blocked_users" USING btree ("blocked_user_id");