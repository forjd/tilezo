CREATE TABLE "friendships" (
	"user_id" text NOT NULL,
	"friend_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_id_friend_user_id_pk" PRIMARY KEY("user_id","friend_user_id"),
	CONSTRAINT "friendships_no_self_check" CHECK ("user_id" <> "friend_user_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_user_id_users_id_fk" FOREIGN KEY ("friend_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "friendships_friend_user_id_idx" ON "friendships" USING btree ("friend_user_id");
