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

export const workflows = pgTable("workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  businessType: text("business_type"),
  isDefault: boolean("is_default").default(false),
  activeVersionId: varchar("active_version_id").references(() => workflowVersions.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workflowVersions = pgTable("workflow_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: varchar("workflow_id").notNull().references(() => workflows.id, { onDelete: 'cascade' }),
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
