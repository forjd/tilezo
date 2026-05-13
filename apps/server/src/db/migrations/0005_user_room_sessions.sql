CREATE TABLE "user_room_sessions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_room_sessions" ADD CONSTRAINT "user_room_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_room_sessions" ADD CONSTRAINT "user_room_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_room_sessions_room_id_idx" ON "user_room_sessions" USING btree ("room_id");
