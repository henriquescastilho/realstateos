CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb,
	"output" jsonb,
	"confidence" numeric(5, 4),
	"failure_reason" text,
	"escalation_target" varchar(100),
	"related_entity_type" varchar(50),
	"related_entity_id" uuid,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_contract_id" uuid NOT NULL,
	"due_date_rule" varchar(50) DEFAULT 'first_business_day' NOT NULL,
	"charge_components" jsonb DEFAULT '[]'::jsonb,
	"collection_method" varchar(50) DEFAULT 'boleto_pix' NOT NULL,
	"late_fee_rule" jsonb DEFAULT '{"percentage":"2.00"}'::jsonb,
	"interest_rule" jsonb DEFAULT '{"dailyPercentage":"0.033"}'::jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_contract_id" uuid NOT NULL,
	"billing_period" varchar(7) NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb,
	"gross_amount" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"penalty_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"issue_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'open' NOT NULL,
	"second_copy_count" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"source" varchar(50) NOT NULL,
	"storage_reference" varchar(500),
	"parsed_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"confidence_score" numeric(5, 4),
	"parsed_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider_name" varchar(100) NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"auth_mode" varchar(20) DEFAULT 'apikey' NOT NULL,
	"retry_policy" jsonb DEFAULT '{"maxAttempts":3,"backoffMs":1000}'::jsonb,
	"last_sync_status" varchar(20),
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"rent_amount" numeric(12, 2) NOT NULL,
	"deposit_type" varchar(50),
	"charge_rules" jsonb DEFAULT '{}'::jsonb,
	"payout_rules" jsonb DEFAULT '{}'::jsonb,
	"operational_status" varchar(30) DEFAULT 'pending_onboarding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_contract_id" uuid,
	"property_id" uuid NOT NULL,
	"opened_by" varchar(50) NOT NULL,
	"category" varchar(50),
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"resolution_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"template_type" varchar(50) NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"document" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"document_number" varchar(20) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"payout_preferences" jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"received_amount" numeric(12, 2) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"bank_reference" varchar(100),
	"reconciliation_status" varchar(20) DEFAULT 'unmatched' NOT NULL,
	"divergence_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"address" varchar(500) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"zip" varchar(10) NOT NULL,
	"type" varchar(50) DEFAULT 'residential',
	"area_sqm" numeric(10, 2),
	"bedrooms" integer,
	"registry_reference" varchar(100),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"lease_contract_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"document_number" varchar(20) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"guarantee_profile" jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_tasks_org_id_idx" ON "agent_tasks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agent_tasks_status_idx" ON "agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_tasks_entity_idx" ON "agent_tasks" USING btree ("related_entity_type","related_entity_id");--> statement-breakpoint
CREATE INDEX "billing_schedules_contract_idx" ON "billing_schedules" USING btree ("lease_contract_id");--> statement-breakpoint
CREATE INDEX "charges_org_id_idx" ON "charges" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "charges_contract_idx" ON "charges" USING btree ("lease_contract_id");--> statement-breakpoint
CREATE INDEX "charges_period_idx" ON "charges" USING btree ("billing_period");--> statement-breakpoint
CREATE INDEX "charges_status_idx" ON "charges" USING btree ("issue_status","payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_idempotency_idx" ON "charges" USING btree ("lease_contract_id","billing_period","issue_status");--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "lease_contracts_org_id_idx" ON "lease_contracts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lease_contracts_property_id_idx" ON "lease_contracts" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "lease_contracts_status_idx" ON "lease_contracts" USING btree ("operational_status");--> statement-breakpoint
CREATE INDEX "maintenance_org_id_idx" ON "maintenance_tickets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "maintenance_property_idx" ON "maintenance_tickets" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "maintenance_status_idx" ON "maintenance_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_entity_idx" ON "message_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "owners_org_id_idx" ON "owners" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payments_charge_idx" ON "payments" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "payments_bank_ref_idx" ON "payments" USING btree ("bank_reference");--> statement-breakpoint
CREATE INDEX "properties_org_id_idx" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tenants_org_id_idx" ON "tenants" USING btree ("org_id");