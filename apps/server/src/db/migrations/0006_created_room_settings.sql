ALTER TABLE "rooms" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "access" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "capacity" integer DEFAULT 25 NOT NULL;
