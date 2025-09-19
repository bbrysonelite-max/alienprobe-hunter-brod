CREATE TABLE "email_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"template_key" text NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"provider_message_id" text,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"template_key" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"step" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"enabled" boolean DEFAULT true,
	CONSTRAINT "email_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"details" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"website" text,
	"contact_name" text,
	"email" text,
	"email_domain" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_personal_email" boolean DEFAULT false,
	"is_disposable" boolean DEFAULT false,
	"recaptcha_score" real,
	"verification_token_hash" text,
	"verification_expires_at" timestamp,
	"last_contacted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;