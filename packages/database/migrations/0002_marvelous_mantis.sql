CREATE TABLE "price_list" (
	"storage_number" serial PRIMARY KEY NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text NOT NULL,
	"month_amount" integer NOT NULL,
	"year_amount" integer NOT NULL
);
