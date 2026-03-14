ALTER TABLE "charges" ADD COLUMN "boleto_id" varchar(100);--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "barcode" varchar(60);--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "digitavel_line" varchar(60);--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "boleto_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "boleto_error" text;