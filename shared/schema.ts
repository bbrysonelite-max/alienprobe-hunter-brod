import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, real, json } from "drizzle-orm/pg-core";
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
