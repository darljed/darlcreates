ALTER TABLE "products" ADD COLUMN "is_service" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "products" SET "is_service" = true WHERE "id" IN (SELECT "product_id" FROM "product_options" WHERE "constraints" ? 'clicker');
