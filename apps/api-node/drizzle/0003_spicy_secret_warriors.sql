CREATE TABLE "agent_configs" (
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
CREATE TABLE "channel_configs" (
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
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid,
	"title" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
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
CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
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
CREATE TABLE "inbox_messages" (
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
CREATE TABLE "inbox_threads" (
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
CREATE TABLE "webhook_subscriptions" (
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
ALTER TABLE "agent_tasks" ADD COLUMN "executed_action" jsonb;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "reviewed_by" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "smtp_settings" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_configs_org_task_type_idx" ON "agent_configs" USING btree ("org_id","task_type");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_configs_org_channel_idx" ON "channel_configs" USING btree ("org_id","channel");--> statement-breakpoint
CREATE INDEX "chat_conversations_org_id_idx" ON "chat_conversations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_tenant_id_idx" ON "chat_conversations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_org_id_idx" ON "document_embeddings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_doc_id_idx" ON "document_embeddings" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "event_log_org_id_idx" ON "event_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "event_log_type_idx" ON "event_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "inbound_messages_org_id_idx" ON "inbound_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inbound_messages_sender_idx" ON "inbound_messages" USING btree ("sender_phone");--> statement-breakpoint
CREATE INDEX "inbox_messages_thread_id_idx" ON "inbox_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_threads_org_channel_contact_idx" ON "inbox_threads" USING btree ("org_id","channel","contact_identifier");--> statement-breakpoint
CREATE INDEX "inbox_threads_org_id_idx" ON "inbox_threads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inbox_threads_status_idx" ON "inbox_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_org_id_idx" ON "webhook_subscriptions" USING btree ("org_id");