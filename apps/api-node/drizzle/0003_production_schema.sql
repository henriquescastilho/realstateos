-- Add missing columns to existing tables
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtp_settings" jsonb;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "municipal_registration" varchar(100);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "condo_admin" jsonb;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "closing_day" integer DEFAULT 27;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "due_date_day" integer DEFAULT 1;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "payout_day" integer DEFAULT 4;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "admin_fee_percent" numeric(5, 2) DEFAULT '10.00';
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "admin_fee_minimum" numeric(12, 2) DEFAULT '180.00';
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "readjustment_rule" jsonb;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "agent_instructions" text;
--> statement-breakpoint

-- New tables
CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_types" jsonb NOT NULL,
	"target_url" varchar(500) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"last_delivery_status" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"external_message_id" varchar(255),
	"sender_phone" varchar(30),
	"sender_name" varchar(255),
	"content" text,
	"media_url" varchar(500),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_entity_type" varchar(50),
	"matched_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"contact_identifier" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"linked_entity_type" varchar(50),
	"linked_entity_id" uuid,
	"linked_property_id" uuid,
	"linked_contract_id" uuid,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"assigned_to" varchar(255),
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" varchar(10) NOT NULL,
	"content" text,
	"media_url" varchar(500),
	"external_message_id" varchar(255),
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"sent_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid,
	"source_type" varchar(50),
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid,
	"title" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"auto_execute_threshold" numeric(5, 4) DEFAULT '0.8500' NOT NULL,
	"escalate_threshold" numeric(5, 4) DEFAULT '0.5000' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"issuer" varchar(255),
	"value" numeric(12, 2) NOT NULL,
	"due_date" date NOT NULL,
	"barcode" varchar(60),
	"digitable_line" varchar(60),
	"reference_month" varchar(7) NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"source_reference" varchar(500),
	"capture_confidence" numeric(5, 4),
	"status" varchar(20) DEFAULT 'captured' NOT NULL,
	"paid_at" timestamp with time zone,
	"agent_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Indexes
CREATE INDEX IF NOT EXISTS "webhook_subscriptions_org_id_idx" ON "webhook_subscriptions" ("org_id");
CREATE INDEX IF NOT EXISTS "event_log_org_id_idx" ON "event_log" ("org_id");
CREATE INDEX IF NOT EXISTS "event_log_type_idx" ON "event_log" ("event_type");
CREATE UNIQUE INDEX IF NOT EXISTS "channel_configs_org_channel_idx" ON "channel_configs" ("org_id", "channel");
CREATE INDEX IF NOT EXISTS "inbound_messages_org_id_idx" ON "inbound_messages" ("org_id");
CREATE INDEX IF NOT EXISTS "inbound_messages_sender_idx" ON "inbound_messages" ("sender_phone");
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_threads_org_channel_contact_idx" ON "inbox_threads" ("org_id", "channel", "contact_identifier");
CREATE INDEX IF NOT EXISTS "inbox_threads_org_id_idx" ON "inbox_threads" ("org_id");
CREATE INDEX IF NOT EXISTS "inbox_threads_status_idx" ON "inbox_threads" ("status");
CREATE INDEX IF NOT EXISTS "inbox_messages_thread_id_idx" ON "inbox_messages" ("thread_id");
CREATE INDEX IF NOT EXISTS "document_embeddings_org_id_idx" ON "document_embeddings" ("org_id");
CREATE INDEX IF NOT EXISTS "document_embeddings_doc_id_idx" ON "document_embeddings" ("document_id");
CREATE INDEX IF NOT EXISTS "chat_conversations_org_id_idx" ON "chat_conversations" ("org_id");
CREATE INDEX IF NOT EXISTS "chat_conversations_tenant_id_idx" ON "chat_conversations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_id_idx" ON "chat_messages" ("conversation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_configs_org_task_type_idx" ON "agent_configs" ("org_id", "task_type");
CREATE INDEX IF NOT EXISTS "property_expenses_org_id_idx" ON "property_expenses" ("org_id");
CREATE INDEX IF NOT EXISTS "property_expenses_property_idx" ON "property_expenses" ("property_id");
CREATE UNIQUE INDEX IF NOT EXISTS "property_expenses_idempotency_idx" ON "property_expenses" ("property_id", "type", "reference_month");
