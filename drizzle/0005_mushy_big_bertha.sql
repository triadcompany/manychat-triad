CREATE TABLE "instagram_follow_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_follow_gates_user_key" UNIQUE("organization_id","ig_user_id")
);
--> statement-breakpoint
ALTER TABLE "instagram_funnel_rules" ADD COLUMN "require_follow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_follow_gates" ADD CONSTRAINT "instagram_follow_gates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_follow_gates" ADD CONSTRAINT "instagram_follow_gates_lead_id_instagram_funnel_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."instagram_funnel_leads"("id") ON DELETE cascade ON UPDATE no action;