-- Initial schema for Alien Probe Business Scanner
-- Generated on 2025-09-19T03:58:51.617Z

-- Create users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text NOT NULL UNIQUE,
  "password" text NOT NULL
);

-- Create scan_results table  
CREATE TABLE IF NOT EXISTS "scan_results" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_name" text NOT NULL,
  "website" text,
  "email" text,
  "scan_data" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_scan_results_status" ON "scan_results" ("status");
CREATE INDEX IF NOT EXISTS "idx_scan_results_created_at" ON "scan_results" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_scan_results_business_name" ON "scan_results" ("business_name");