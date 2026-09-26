CREATE TABLE "instagram_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"ig_username" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_preview" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_conversations_user_key" UNIQUE("organization_id","ig_user_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instagram_conversations" ADD CONSTRAINT "instagram_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_messages" ADD CONSTRAINT "instagram_messages_conversation_id_instagram_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."instagram_conversations"("id") ON DELETE cascade ON UPDATE no action;