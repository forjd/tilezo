CREATE TABLE "user_inventory" (
	"user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_inventory_user_id_item_type_pk" PRIMARY KEY("user_id","item_type"),
	CONSTRAINT "user_inventory_quantity_check" CHECK ("user_inventory"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dollars" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_inventory_user_id_idx" ON "user_inventory" USING btree ("user_id");