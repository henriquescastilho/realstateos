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
CREATE INDEX IF NOT EXISTS "property_expenses_org_id_idx" ON "property_expenses" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_expenses_property_idx" ON "property_expenses" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_expenses_idempotency_idx" ON "property_expenses" USING btree ("property_id","type","reference_month");
