CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"comment" text,
	"input" jsonb NOT NULL,
	"tiers" jsonb NOT NULL,
	"total_cost_cents" integer NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_date" timestamp DEFAULT now() NOT NULL,
	"product_id" uuid,
	"product" text NOT NULL,
	"quantity" integer NOT NULL,
	"price_per_item_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"extra_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_status" text DEFAULT 'Unpaid' NOT NULL,
	"mode_of_payment" text,
	"status" text DEFAULT 'For Processing' NOT NULL,
	"delivery_details" text,
	"contact" text,
	"details" text,
	"deducted_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'piece' NOT NULL,
	"qty_on_hand" double precision DEFAULT 0 NOT NULL,
	"reorder_level" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_parts" (
	"product_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"qty" double precision NOT NULL,
	CONSTRAINT "product_parts_product_id_part_id_pk" PRIMARY KEY("product_id","part_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"delta" double precision NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"qty" double precision NOT NULL,
	"total_cost_cents" integer NOT NULL,
	"supplier" text,
	"purchased_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "print_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stock_deducted_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cogs_cents" integer;--> statement-breakpoint
ALTER TABLE "manual_sales" ADD CONSTRAINT "manual_sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_sales_date_idx" ON "manual_sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "stock_movements_part_idx" ON "stock_movements" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ref_idx" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "stock_purchases_part_idx" ON "stock_purchases" USING btree ("part_id");