CREATE TABLE "record_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"entity_table" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"previous_values" jsonb NOT NULL,
	"reason" text NOT NULL,
	"edited_by_staff_id" uuid
);
--> statement-breakpoint
ALTER TABLE "record_revisions" ADD CONSTRAINT "record_revisions_edited_by_staff_id_staff_id_fk" FOREIGN KEY ("edited_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_revisions_entity_idx" ON "record_revisions" USING btree ("entity_table","entity_id","created_at");