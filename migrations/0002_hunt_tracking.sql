CREATE TABLE "hunt_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"businesses_discovered" integer DEFAULT 0,
	"leads_created" integer DEFAULT 0,
	"scans_triggered" integer DEFAULT 0,
	"quota_used" integer DEFAULT 0,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"hunt_run_id" varchar,
	"scan_id" varchar,
	"workflow_run_id" varchar,
	"status" text DEFAULT 'discovery' NOT NULL,
	"current_step" text,
	"progress" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp,
	"tools_recommended" integer DEFAULT 0,
	"estimated_value" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "hunt_runs_status_idx" ON "hunt_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hunt_runs_job_id_idx" ON "hunt_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "hunt_runs_created_at_idx" ON "hunt_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pipeline_runs_status_idx" ON "pipeline_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pipeline_runs_lead_id_idx" ON "pipeline_runs" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_created_at_idx" ON "pipeline_runs" USING btree ("created_at");