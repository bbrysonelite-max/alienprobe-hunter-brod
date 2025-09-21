import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, real, json, jsonb, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const scanResults = pgTable("scan_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessName: text("business_name").notNull(),
  website: text("website"),
  email: text("email"),
  scanData: text("scan_data"),
  status: text("status").notNull().default("pending"),
  leadId: varchar("lead_id").references(() => leads.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessName: text("business_name").notNull(),
  website: text("website"),
  contactName: text("contact_name"),
  email: text("email"),
  role: text("role"),
  companySize: text("company_size"),
  industry: text("industry"),
  budgetRange: text("budget_range"),
  timeframe: text("timeframe"),
  painPoints: text("pain_points"),
  emailDomain: text("email_domain"),
  status: text("status").notNull().default("pending"), // pending/verified/flagged/converted/disqualified
  source: text("source").notNull().default("manual"), // manual, google_places, yelp, serp_api, etc.
  discoveryResultId: varchar("discovery_result_id"), // link to discovery if auto-generated - reference added later
  isPersonalEmail: boolean("is_personal_email").default(false),
  isDisposable: boolean("is_disposable").default(false),
  recaptchaScore: real("recaptcha_score"),
  verificationTokenHash: text("verification_token_hash"),
  verificationExpiresAt: timestamp("verification_expires_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leadEvents = pgTable("lead_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  eventType: text("event_type").notNull(),
  details: json("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  step: text("step").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  enabled: boolean("enabled").default(true),
});

export const emailQueue = pgTable("email_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  templateKey: text("template_key").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  retryCount: integer("retry_count").default(0),
  nextRetryAt: timestamp("next_retry_at"),
  lastError: text("last_error"),
  status: text("status").notNull().default("pending"), // pending/sent/failed/retrying
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailLog = pgTable("email_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  templateKey: text("template_key").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull(), // sent/delivered/bounced/failed
  error: text("error"),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  scanId: varchar("scan_id").references(() => scanResults.id), // Optional link to scan_results
  amount: integer("amount").notNull(), // Amount in cents
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("initialized"), // initialized/paid/failed/refunded
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(), // links messages together
  scanId: varchar("scan_id").references(() => scanResults.id), // optional: link to specific scan
  leadId: varchar("lead_id").references(() => leads.id), // optional: link to specific lead
  role: text("role").notNull(), // user/assistant/system
  content: text("content").notNull(),
  metadata: json("metadata"), // store context, tokens used, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== PROSPECTING TABLES (Hunter Brody Lead Generation Engine) =====

export const leadSources = pgTable("lead_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // google_places, yelp, serp_api, etc.
  name: text("name").notNull(),
  type: text("type").notNull(), // api, scraper, directory
  config: jsonb("config").notNull(), // API keys, search params, etc.
  enabled: boolean("enabled").default(true),
  dailyQuota: integer("daily_quota").default(1000),
  dailyUsed: integer("daily_used").default(0),
  lastResetAt: timestamp("last_reset_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const discoveryJobs = pgTable("discovery_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").notNull().references(() => leadSources.id),
  name: text("name").notNull(),
  searchParams: jsonb("search_params").notNull(), // industry, location, keywords, etc.
  schedule: text("schedule"), // cron-like: daily, weekly, etc.
  enabled: boolean("enabled").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  resultsCount: integer("results_count").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const discoveryResults = pgTable("discovery_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  sourceRef: text("source_ref").notNull(), // external ID from API
  rawData: jsonb("raw_data").notNull(), // full API response
  businessName: text("business_name").notNull(),
  website: text("website"),
  address: text("address"),
  phone: text("phone"),
  industry: text("industry"),
  rating: real("rating"),
  reviewCount: integer("review_count"),
  dedupKey: text("dedup_key").notNull(), // domain or normalized name for deduplication
  leadId: varchar("lead_id"), // created lead if processed - reference added later
  processed: boolean("processed").default(false),
  discarded: boolean("discarded").default(false), // filtered out by ICP rules
  discardReason: text("discard_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    dedupIndex: index("discovery_results_dedup_idx").on(table.dedupKey),
    jobIndex: index("discovery_results_job_idx").on(table.jobId),
  };
});

export const prospectContacts = pgTable("prospect_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  discoveryResultId: varchar("discovery_result_id").references(() => discoveryResults.id),
  type: text("type").notNull(), // email, phone, linkedin, etc.
  value: text("value").notNull(), // actual contact info
  role: text("role"), // owner, manager, contact, etc.
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  confidence: real("confidence"), // 0-1 confidence score
  source: text("source"), // website, api, enrichment
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    leadContactIndex: index("prospect_contacts_lead_idx").on(table.leadId),
    typeValueIndex: index("prospect_contacts_type_value_idx").on(table.type, table.value),
  };
});

export const suppressionList = pgTable("suppression_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // email, domain, phone
  value: text("value").notNull(),
  reason: text("reason").notNull(), // unsubscribe, bounce, complaint, manual
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    typeValueIndex: unique("suppression_type_value_unique").on(table.type, table.value),
  };
});

export const icpRules = pgTable("icp_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  conditions: jsonb("conditions").notNull(), // filtering logic
  action: text("action").notNull(), // include, exclude, score
  priority: integer("priority").default(0),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workflows = pgTable("workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  businessType: text("business_type"),
  isDefault: boolean("is_default").default(false),
  activeVersionId: varchar("active_version_id"), // reference added later
  createdAt: timestamp("created_at").defaultNow(),
});

export const workflowVersions = pgTable("workflow_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: varchar("workflow_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"), // draft/published
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    // Unique constraint to prevent duplicate workflow versions
    workflowVersionUnique: unique().on(table.workflowId, table.version),
    // Performance indexes
    statusIdx: index("workflow_versions_status_idx").on(table.status),
    createdAtIdx: index("workflow_versions_created_at_idx").on(table.createdAt),
    workflowIdIdx: index("workflow_versions_workflow_id_idx").on(table.workflowId),
  };
});

export const workflowRuns = pgTable("workflow_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowVersionId: varchar("workflow_version_id").notNull().references(() => workflowVersions.id, { onDelete: 'cascade' }),
  scanId: varchar("scan_id").references(() => scanResults.id, { onDelete: 'set null' }),
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: 'set null' }),
  status: text("status").notNull().default("queued"), // queued/running/succeeded/failed
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    // Performance indexes for common queries
    statusIdx: index("workflow_runs_status_idx").on(table.status),
    workflowVersionIdIdx: index("workflow_runs_workflow_version_id_idx").on(table.workflowVersionId),
    createdAtIdx: index("workflow_runs_created_at_idx").on(table.createdAt),
    startedAtIdx: index("workflow_runs_started_at_idx").on(table.startedAt),
    // Composite index for version + status queries
    versionStatusIdx: index("workflow_runs_version_status_idx").on(table.workflowVersionId, table.status),
  };
});

export const workflowRunSteps = pgTable("workflow_run_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  stepKey: text("step_key").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  attempt: integer("attempt").notNull().default(1),
}, (table) => {
  return {
    // Performance indexes for step queries
    runIdIdx: index("workflow_run_steps_run_id_idx").on(table.runId),
    statusIdx: index("workflow_run_steps_status_idx").on(table.status),
    stepKeyIdx: index("workflow_run_steps_step_key_idx").on(table.stepKey),
    typeIdx: index("workflow_run_steps_type_idx").on(table.type),
    startedAtIdx: index("workflow_run_steps_started_at_idx").on(table.startedAt),
    // Composite index for run + step key queries (common for workflow execution)
    runStepIdx: index("workflow_run_steps_run_step_idx").on(table.runId, table.stepKey),
  };
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertScanResultSchema = createInsertSchema(scanResults).omit({
  id: true,
  createdAt: true,
}).extend({
  businessName: z.string().min(1, "Business name is required"),
  website: z.string().url("Valid URL required").optional(),
  email: z.string().email("Valid email required").optional(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  emailDomain: true,
  isPersonalEmail: true,
  isDisposable: true,
}).extend({
  businessName: z.string().min(1, "Business name is required"),
  website: z.string().url("Valid URL required").optional(),
  contactName: z.string().min(1, "Contact name is required").optional(),
  email: z.string().email("Valid email required").optional(),
  role: z.string().min(1, "Role is required").optional(),
  companySize: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]).optional(),
  industry: z.string().min(1, "Industry is required").optional(),
  budgetRange: z.enum(["<5k", "5k-25k", "25k-100k", "100k-500k", "500k+"]).optional(),
  timeframe: z.enum(["immediate", "1-3months", "3-6months", "6-12months", "12months+"]).optional(),
  painPoints: z.string().max(1000, "Pain points must be under 1000 characters").optional(),
  status: z.enum(["pending", "verified", "flagged", "converted", "disqualified"]).optional(),
  verificationTokenHash: z.string().optional(),
  verificationExpiresAt: z.date().optional(),
});

export const insertLeadEventSchema = createInsertSchema(leadEvents).omit({
  id: true,
  createdAt: true,
}).extend({
  leadId: z.string().min(1, "Lead ID is required"),
  eventType: z.string().min(1, "Event type is required"),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
}).extend({
  key: z.string().min(1, "Template key is required"),
  step: z.string().min(1, "Step is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
});

export const insertEmailQueueSchema = createInsertSchema(emailQueue).omit({
  id: true,
  createdAt: true,
}).extend({
  leadId: z.string().min(1, "Lead ID is required"),
  templateKey: z.string().min(1, "Template key is required"),
  scheduledAt: z.date(),
  retryCount: z.number().optional(),
  nextRetryAt: z.date().optional(),
  status: z.enum(["pending", "sent", "failed", "retrying"]).optional(),
});

export const insertEmailLogSchema = createInsertSchema(emailLog).omit({
  id: true,
  sentAt: true,
}).extend({
  leadId: z.string().min(1, "Lead ID is required"),
  templateKey: z.string().min(1, "Template key is required"),
  status: z.enum(["sent", "delivered", "bounced", "failed"]),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
}).extend({
  leadId: z.string().min(1, "Lead ID is required"),
  scanId: z.string().optional(), // Optional scan ID reference
  amount: z.number().int().positive("Amount must be positive"),
  currency: z.string().min(1, "Currency is required").optional(),
  status: z.enum(["initialized", "paid", "failed", "refunded"]).optional(),
  stripeSessionId: z.string().optional(),
  stripePaymentIntentId: z.string().optional(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
}).extend({
  conversationId: z.string().min(1, "Conversation ID is required"),
  scanId: z.string().optional(),
  leadId: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1, "Content is required"),
  metadata: z.any().optional(),
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Workflow name is required"),
  businessType: z.string().optional(),
  isDefault: z.boolean().optional(),
  activeVersionId: z.string().optional(),
});

export const insertWorkflowVersionSchema = createInsertSchema(workflowVersions).omit({
  id: true,
  createdAt: true,
}).extend({
  workflowId: z.string().min(1, "Workflow ID is required"),
  version: z.number().int().positive("Version must be a positive integer"),
  status: z.enum(["draft", "published"]).optional(),
  definition: z.any(), // JSON definition
});

export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({
  id: true,
  createdAt: true,
}).extend({
  workflowVersionId: z.string().min(1, "Workflow version ID is required"),
  scanId: z.string().optional(),
  leadId: z.string().optional(),
  status: z.enum(["queued", "running", "succeeded", "failed"]).optional(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  context: z.any().optional(), // JSON context
});

export const insertWorkflowRunStepSchema = createInsertSchema(workflowRunSteps).omit({
  id: true,
}).extend({
  runId: z.string().min(1, "Run ID is required"),
  stepKey: z.string().min(1, "Step key is required"),
  type: z.string().min(1, "Step type is required"),
  status: z.string().min(1, "Step status is required"),
  input: z.any().optional(), // JSON input
  output: z.any().optional(), // JSON output
  error: z.string().optional(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  attempt: z.number().int().positive("Attempt must be a positive integer").optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertScanResult = z.infer<typeof insertScanResultSchema>;
export type ScanResult = typeof scanResults.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLeadEvent = z.infer<typeof insertLeadEventSchema>;
export type LeadEvent = typeof leadEvents.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailQueue = z.infer<typeof insertEmailQueueSchema>;
export type EmailQueue = typeof emailQueue.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLog.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflowVersion = z.infer<typeof insertWorkflowVersionSchema>;
export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRunStep = z.infer<typeof insertWorkflowRunStepSchema>;
export type WorkflowRunStep = typeof workflowRunSteps.$inferSelect;

// ===== HUNT EXECUTION TRACKING =====

export const huntRuns = pgTable("hunt_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  status: text("status").notNull().default("queued"), // queued/running/completed/failed
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  businessesDiscovered: integer("businesses_discovered").default(0),
  leadsCreated: integer("leads_created").default(0),
  scansTriggered: integer("scans_triggered").default(0),
  quotaUsed: integer("quota_used").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // search params, source quotas, etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    statusIdx: index("hunt_runs_status_idx").on(table.status),
    jobIdIdx: index("hunt_runs_job_id_idx").on(table.jobId),
    createdAtIdx: index("hunt_runs_created_at_idx").on(table.createdAt),
  };
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  huntRunId: varchar("hunt_run_id"),
  scanId: varchar("scan_id"),
  workflowRunId: varchar("workflow_run_id"),
  status: text("status").notNull().default("discovery"), // discovery/scanning/recommendations/completed/failed
  currentStep: text("current_step"), // track which stage is executing
  progress: integer("progress").default(0), // 0-100 completion percentage
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  toolsRecommended: integer("tools_recommended").default(0),
  estimatedValue: integer("estimated_value").default(0), // in cents
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    statusIdx: index("pipeline_runs_status_idx").on(table.status),
    leadIdIdx: index("pipeline_runs_lead_id_idx").on(table.leadId),
    createdAtIdx: index("pipeline_runs_created_at_idx").on(table.createdAt),
  };
});

// Insert schemas for hunt tracking
export const insertHuntRunSchema = createInsertSchema(huntRuns).omit({
  id: true,
  createdAt: true,
});

export const insertPipelineRunSchema = createInsertSchema(pipelineRuns).omit({
  id: true,
  createdAt: true,
});

export type InsertHuntRun = z.infer<typeof insertHuntRunSchema>;
export type HuntRun = typeof huntRuns.$inferSelect;
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRun = typeof pipelineRuns.$inferSelect;

// ===== SYSTEM CONFIGURATION TABLES =====

export const systemGoals = pgTable("system_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  goalType: varchar("goal_type", { length: 50 }).notNull(), // 'daily_scans', 'weekly_revenue', etc.
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").default(0).notNull(),
  resetDate: timestamp("reset_date").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// System goals schemas
export const insertSystemGoalSchema = createInsertSchema(systemGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSystemGoal = z.infer<typeof insertSystemGoalSchema>;
export type SystemGoal = typeof systemGoals.$inferSelect;

// ===== TOOL RECOMMENDATION TABLES (Hunter Brody Revenue Engine) =====

export const toolCategories = pgTable("tool_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // icon name for UI
  priority: integer("priority").default(0), // display order
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const businessTools = pgTable("business_tools", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  shortDescription: text("short_description"), // one-liner for cards
  website: text("website").notNull(),
  logo: text("logo"), // logo URL
  categoryId: varchar("category_id").notNull().references(() => toolCategories.id),
  pricing: jsonb("pricing").notNull(), // {plan: "free/paid", minPrice: 0, maxPrice: 299, currency: "USD"}
  targetBusinessSize: text("target_business_size").array(), // ["1-10", "11-50", etc]
  targetIndustries: text("target_industries").array(), // ["restaurant", "retail", etc]
  features: text("features").array(), // ["CRM", "Analytics", "Automation"]
  useCases: text("use_cases").array(), // ["Lead Management", "Customer Support"]
  integrations: text("integrations").array(), // ["Slack", "Salesforce", "HubSpot"]
  affiliateUrl: text("affiliate_url"), // our affiliate/referral link
  commissionRate: real("commission_rate"), // percentage commission (0-100)
  tags: text("tags").array(), // ["popular", "recommended", "new"]
  rating: real("rating").default(0), // 0-5 star rating
  reviewCount: integer("review_count").default(0),
  priority: integer("priority").default(0), // recommendation priority within category
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    categoryIndex: index("business_tools_category_idx").on(table.categoryId),
    enabledIndex: index("business_tools_enabled_idx").on(table.enabled),
    priorityIndex: index("business_tools_priority_idx").on(table.priority),
  };
});

export const toolRecommendations = pgTable("tool_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  scanId: varchar("scan_id").references(() => scanResults.id),
  toolId: varchar("tool_id").notNull().references(() => businessTools.id),
  recommendationScore: real("recommendation_score").notNull(), // 0-100 match score
  reasonsShown: text("reasons_shown").array(), // ["Industry match", "Size fit", "Feature need"]
  matchingCriteria: jsonb("matching_criteria"), // detailed matching logic used
  position: integer("position").notNull(), // display position in recommendations
  context: text("context"), // where shown: "scan_results", "email", "dashboard"
  status: text("status").notNull().default("generated"), // generated/shown/clicked/converted/dismissed
  shownAt: timestamp("shown_at"),
  clickedAt: timestamp("clicked_at"),
  convertedAt: timestamp("converted_at"),
  dismissedAt: timestamp("dismissed_at"),
  dismissReason: text("dismiss_reason"), // "not_interested", "already_using", "too_expensive"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    leadToolIndex: index("tool_recommendations_lead_tool_idx").on(table.leadId, table.toolId),
    statusIndex: index("tool_recommendations_status_idx").on(table.status),
    scoreIndex: index("tool_recommendations_score_idx").on(table.recommendationScore),
    shownAtIndex: index("tool_recommendations_shown_at_idx").on(table.shownAt),
  };
});

export const recommendationEvents = pgTable("recommendation_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommendationId: varchar("recommendation_id").notNull().references(() => toolRecommendations.id),
  eventType: text("event_type").notNull(), // "view", "click", "signup", "trial", "purchase"
  metadata: jsonb("metadata"), // additional event data
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  referrer: text("referrer"),
  revenue: integer("revenue"), // revenue in cents if applicable
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    recommendationIndex: index("recommendation_events_recommendation_idx").on(table.recommendationId),
    eventTypeIndex: index("recommendation_events_event_type_idx").on(table.eventType),
    createdAtIndex: index("recommendation_events_created_at_idx").on(table.createdAt),
  };
});

// ============= PROSPECTING SCHEMAS & TYPES =============

export const insertLeadSourceSchema = createInsertSchema(leadSources);
export const insertDiscoveryJobSchema = createInsertSchema(discoveryJobs);
export const insertDiscoveryResultSchema = createInsertSchema(discoveryResults);
export const insertProspectContactSchema = createInsertSchema(prospectContacts);
export const insertSuppressionListSchema = createInsertSchema(suppressionList);
export const insertIcpRuleSchema = createInsertSchema(icpRules);

export type InsertLeadSource = z.infer<typeof insertLeadSourceSchema>;
export type LeadSource = typeof leadSources.$inferSelect;
export type InsertDiscoveryJob = z.infer<typeof insertDiscoveryJobSchema>;
export type DiscoveryJob = typeof discoveryJobs.$inferSelect;
export type InsertDiscoveryResult = z.infer<typeof insertDiscoveryResultSchema>;
export type DiscoveryResult = typeof discoveryResults.$inferSelect;
export type InsertProspectContact = z.infer<typeof insertProspectContactSchema>;
export type ProspectContact = typeof prospectContacts.$inferSelect;
export type InsertSuppressionList = z.infer<typeof insertSuppressionListSchema>;
export type SuppressionList = typeof suppressionList.$inferSelect;
export type InsertIcpRule = z.infer<typeof insertIcpRuleSchema>;
export type IcpRule = typeof icpRules.$inferSelect;

// ============= TOOL RECOMMENDATION SCHEMAS & TYPES =============

export const insertToolCategorySchema = createInsertSchema(toolCategories).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Category name is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export const insertBusinessToolSchema = createInsertSchema(businessTools).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Tool name is required"),
  description: z.string().min(1, "Description is required"),
  shortDescription: z.string().optional(),
  website: z.string().url("Valid URL required"),
  logo: z.string().url("Valid logo URL").optional(),
  categoryId: z.string().min(1, "Category ID is required"),
  pricing: z.any(), // JSON pricing object
  targetBusinessSize: z.array(z.string()).optional(),
  targetIndustries: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  integrations: z.array(z.string()).optional(),
  affiliateUrl: z.string().url("Valid affiliate URL").optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export const insertToolRecommendationSchema = createInsertSchema(toolRecommendations).omit({
  id: true,
  createdAt: true,
}).extend({
  leadId: z.string().min(1, "Lead ID is required"),
  scanId: z.string().optional(),
  toolId: z.string().min(1, "Tool ID is required"),
  recommendationScore: z.number().min(0).max(100),
  reasonsShown: z.array(z.string()).optional(),
  matchingCriteria: z.any().optional(),
  position: z.number().int().min(1),
  context: z.enum(["scan_results", "email", "dashboard", "api"]).optional(),
  status: z.enum(["generated", "shown", "clicked", "converted", "dismissed"]).optional(),
});

export const insertRecommendationEventSchema = createInsertSchema(recommendationEvents).omit({
  id: true,
  createdAt: true,
}).extend({
  recommendationId: z.string().min(1, "Recommendation ID is required"),
  eventType: z.enum(["view", "click", "signup", "trial", "purchase"]),
  metadata: z.any().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  referrer: z.string().optional(),
  revenue: z.number().int().min(0).optional(),
});

export type InsertToolCategory = z.infer<typeof insertToolCategorySchema>;
export type ToolCategory = typeof toolCategories.$inferSelect;
export type InsertBusinessTool = z.infer<typeof insertBusinessToolSchema>;
export type BusinessTool = typeof businessTools.$inferSelect;
export type InsertToolRecommendation = z.infer<typeof insertToolRecommendationSchema>;
export type ToolRecommendation = typeof toolRecommendations.$inferSelect;
export type InsertRecommendationEvent = z.infer<typeof insertRecommendationEventSchema>;
export type RecommendationEvent = typeof recommendationEvents.$inferSelect;

// =================== WORKFLOW DEFINITION INTERFACES ===================

/**
 * Tool template definition stored in workflow JSON
 */
export interface ToolTemplate {
  /** Unique template name */
  name: string;
  /** Tool type identifier (httpRequest, webhook, emailSend, aiGenerate) */
  toolType: string;
  /** Tool configuration */
  config: any;
  /** Optional description */
  description?: string;
  /** Domain allowlist for security (for HTTP-based tools) */
  allowedDomains?: string[];
}

/**
 * Workflow step configuration
 */
export interface WorkflowStepConfig {
  /** Unique key for this step within the workflow */
  key: string;
  /** Step type identifier */
  type: string;
  /** Step-specific configuration */
  config: any;
  /** Optional step name for display */
  name?: string;
  /** Optional step description */
  description?: string;
}

/**
 * Edge definition for workflow DAG
 */
export interface WorkflowEdge {
  /** Source step key */
  from: string;
  /** Target step key */
  to: string;
  /** Optional condition for edge traversal */
  when?: string;
}

/**
 * Complete workflow definition structure stored in workflowVersions.definition
 */
export interface WorkflowDefinition {
  /** Array of step definitions */
  steps: WorkflowStepConfig[];
  /** Array of edges defining step transitions */
  edges: WorkflowEdge[];
  /** Entry point step key */
  entry: string;
  /** Optional workflow metadata */
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
  };
  /** Tool templates for toolCall steps */
  tools?: {
    templates: ToolTemplate[];
  };
}

// =================== WORKFLOW DEFINITION SCHEMAS ===================

/**
 * Zod schema for ToolTemplate validation
 */
export const toolTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  toolType: z.enum(["httpRequest", "webhook", "emailSend", "aiGenerate", "googleDriveUpload"]),
  config: z.record(z.any()),
  description: z.string().optional(),
  allowedDomains: z.array(z.string()).optional(),
});

/**
 * Zod schema for WorkflowStepConfig validation
 */
export const workflowStepConfigSchema = z.object({
  key: z.string().min(1, "Step key is required"),
  type: z.string().min(1, "Step type is required"),
  config: z.record(z.any()),
  name: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Zod schema for WorkflowEdge validation
 */
export const workflowEdgeSchema = z.object({
  from: z.string().min(1, "From step key is required"),
  to: z.string().min(1, "To step key is required"),
  when: z.string().optional(),
});

/**
 * Zod schema for WorkflowDefinition validation
 */
export const workflowDefinitionSchema = z.object({
  steps: z.array(workflowStepConfigSchema).min(1, "At least one step is required"),
  edges: z.array(workflowEdgeSchema),
  entry: z.string().min(1, "Entry step key is required"),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
  tools: z.object({
    templates: z.array(toolTemplateSchema),
  }).optional(),
});

// Export types inferred from schemas
export type ToolTemplateType = z.infer<typeof toolTemplateSchema>;
export type WorkflowStepConfigType = z.infer<typeof workflowStepConfigSchema>;
export type WorkflowEdgeType = z.infer<typeof workflowEdgeSchema>;
export type WorkflowDefinitionType = z.infer<typeof workflowDefinitionSchema>;
