CREATE TABLE "app_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "app_config_organization_id_key_key" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "instagram_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"instagram_business_account_id" text NOT NULL,
	"access_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_funnel_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"source_handle" text,
	"target_node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_funnel_edges_source_key" UNIQUE("source_node_id","source_handle")
);
--> statement-breakpoint
CREATE TABLE "instagram_funnel_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"comment_id" text NOT NULL,
	"ig_username" text,
	"ig_user_id" text NOT NULL,
	"comment_text" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_funnel_leads_dedupe_key" UNIQUE("rule_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_funnel_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"type" text NOT NULL,
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"message" text,
	"file_base64" text,
	"file_mimetype" text,
	"file_filename" text,
	"condition_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"condition_use_ai" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_funnel_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"post_thumbnail_url" text,
	"post_permalink" text,
	"keyword" text NOT NULL,
	"message" text NOT NULL,
	"public_reply" text,
	"funnel_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_funnel_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"funnel_id" uuid NOT NULL,
	"current_node_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_funnel_sessions_user_key" UNIQUE("organization_id","ig_user_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_funnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"organization_id" uuid,
	CONSTRAINT "profiles_role_check" CHECK ("profiles"."role" IN ('admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_edges" ADD CONSTRAINT "instagram_funnel_edges_funnel_id_instagram_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."instagram_funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_edges" ADD CONSTRAINT "instagram_funnel_edges_source_node_id_instagram_funnel_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."instagram_funnel_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_edges" ADD CONSTRAINT "instagram_funnel_edges_target_node_id_instagram_funnel_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."instagram_funnel_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_leads" ADD CONSTRAINT "instagram_funnel_leads_rule_id_instagram_funnel_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."instagram_funnel_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_nodes" ADD CONSTRAINT "instagram_funnel_nodes_funnel_id_instagram_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."instagram_funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_rules" ADD CONSTRAINT "instagram_funnel_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_rules" ADD CONSTRAINT "instagram_funnel_rules_funnel_id_instagram_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."instagram_funnels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_sessions" ADD CONSTRAINT "instagram_funnel_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_sessions" ADD CONSTRAINT "instagram_funnel_sessions_funnel_id_instagram_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."instagram_funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_sessions" ADD CONSTRAINT "instagram_funnel_sessions_current_node_id_instagram_funnel_nodes_id_fk" FOREIGN KEY ("current_node_id") REFERENCES "public"."instagram_funnel_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnel_sessions" ADD CONSTRAINT "instagram_funnel_sessions_lead_id_instagram_funnel_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."instagram_funnel_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_funnels" ADD CONSTRAINT "instagram_funnels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;