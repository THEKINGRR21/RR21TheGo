CREATE TABLE "body_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"body_fat_pct" numeric(4, 1),
	"lean_mass_kg" numeric(5, 2),
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"logged_for" date NOT NULL,
	"meal" text,
	"grams" numeric(7, 2) NOT NULL,
	"kcal" numeric(7, 2) NOT NULL,
	"protein_g" numeric(6, 2),
	"fat_g" numeric(6, 2),
	"carb_g" numeric(6, 2),
	"client_id" text NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_servings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"label" text NOT NULL,
	"grams" numeric(7, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"kcal_per_100g" numeric(7, 2) NOT NULL,
	"protein_per_100g" numeric(6, 2),
	"fat_per_100g" numeric(6, 2),
	"carb_per_100g" numeric(6, 2),
	"fiber_per_100g" numeric(6, 2),
	"owner_user_id" uuid,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"carb_g" integer NOT NULL,
	"basis" text NOT NULL,
	"bmr_kcal" integer,
	"tdee_kcal" integer,
	"formula" text,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text,
	"sex_at_birth" text,
	"birth_date" date NOT NULL,
	"height_cm" numeric(5, 1),
	"units" text DEFAULT 'metric' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_auth_subject_unique" UNIQUE("auth_subject"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_servings" ADD CONSTRAINT "food_servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "body_metrics_user_measured_source_idx" ON "body_metrics" USING btree ("user_id","measured_on","source");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_user_client_idx" ON "entries" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "entries_user_logged_for_idx" ON "entries" USING btree ("user_id","logged_for");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_source_id_idx" ON "foods" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "foods_barcode_idx" ON "foods" USING btree ("barcode") WHERE barcode is not null;--> statement-breakpoint
CREATE INDEX "foods_search_vector_idx" ON "foods" USING gin ("search_vector");