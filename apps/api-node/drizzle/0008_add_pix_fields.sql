-- Add PIX copia e cola fields to charges table
ALTER TABLE "charges" ADD COLUMN "pix_emv" text;
ALTER TABLE "charges" ADD COLUMN "pix_tx_id" varchar(100);
