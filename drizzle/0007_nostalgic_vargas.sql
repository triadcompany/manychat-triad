ALTER TABLE "instagram_funnel_leads" ALTER COLUMN "rule_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_funnel_leads" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;