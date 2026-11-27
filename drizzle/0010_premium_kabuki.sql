CREATE TABLE "ai_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"s3_key" text NOT NULL,
	"scene" text NOT NULL,
	"direction" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_photos" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_images" ADD CONSTRAINT "ai_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_images" ADD CONSTRAINT "ai_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;