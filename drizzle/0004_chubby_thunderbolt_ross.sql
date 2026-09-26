CREATE TABLE "instagram_contact_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_contact_tags_key" UNIQUE("conversation_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_tags_org_name_key" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "instagram_conversations" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "instagram_conversations" ADD COLUMN "source_detail" text;--> statement-breakpoint
ALTER TABLE "instagram_contact_tags" ADD CONSTRAINT "instagram_contact_tags_conversation_id_instagram_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."instagram_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_contact_tags" ADD CONSTRAINT "instagram_contact_tags_tag_id_instagram_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."instagram_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_tags" ADD CONSTRAINT "instagram_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;