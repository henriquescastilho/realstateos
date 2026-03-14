CREATE TABLE "bank_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'santander' NOT NULL,
	"environment" varchar(20) DEFAULT 'sandbox' NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"client_secret" varchar(255) NOT NULL,
	"workspace_id" varchar(255),
	"cert_path" varchar(500),
	"key_path" varchar(500),
	"base_url" varchar(500) DEFAULT 'https://trust-sandbox.api.santander.com.br' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_health_check" timestamp with time zone,
	"last_health_status" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bank_credentials_org_provider_idx" ON "bank_credentials" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "bank_credentials_org_id_idx" ON "bank_credentials" USING btree ("org_id");