ALTER TABLE "users" ADD COLUMN "consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_active_reference_uq" ON "payments" USING btree ("gcash_reference") WHERE "payments"."status" in ('pending', 'verified');--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending_per_order_uq" ON "payments" USING btree ("order_id") WHERE "payments"."status" = 'pending';