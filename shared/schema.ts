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
  dueAt: timestamp("due_at").notNull(),
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  status: text("status").notNull().default("pending"), // pending/sent/failed
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
}).extend({
  businessName: z.string().min(1, "Business name is required"),
  website: z.string().url("Valid URL required").optional(),
  email: z.string().email("Valid email required").optional(),
  status: z.enum(["pending", "verified", "flagged", "converted", "disqualified"]).optional(),
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
}).extend({
  leadId: z.string().min(1, "Lead ID is required"),
  templateKey: z.string().min(1, "Template key is required"),
  dueAt: z.date(),
  status: z.enum(["pending", "sent", "failed"]).optional(),
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
