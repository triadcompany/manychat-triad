ALTER TABLE "instagram_funnel_rules" ALTER COLUMN "post_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_funnel_rules" ADD COLUMN "trigger_type" text DEFAULT 'comment' NOT NULL;