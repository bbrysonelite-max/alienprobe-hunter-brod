import { 
  users, 
  scanResults, 
  leads, 
  leadEvents,
  emailTemplates,
  emailQueue,
  emailLog,
  payments,
  chatMessages,
  type User, 
  type InsertUser, 
  type ScanResult, 
  type InsertScanResult,
  type Lead,
  type InsertLead,
  type LeadEvent,
  type InsertLeadEvent,
  type EmailTemplate,
  type InsertEmailTemplate,
  type EmailQueue,
  type InsertEmailQueue,
  type EmailLog,
  type InsertEmailLog,
  type Payment,
  type InsertPayment,
  type ChatMessage,
  type InsertChatMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql, asc, or, gte, lte } from "drizzle-orm";
import { classifyEmailDomain, shouldFlagLead, getFlaggingReason } from "./utils/emailDomainFilter";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getScanResult(id: string): Promise<ScanResult | undefined>;
  getAllScanResults(): Promise<ScanResult[]>;
  createScanResult(scanResult: InsertScanResult): Promise<ScanResult>;
  updateScanResult(id: string, updates: Partial<ScanResult>): Promise<ScanResult | undefined>;

  // Lead operations
  getLead(id: string): Promise<Lead | undefined>;
  getLeadByEmail(email: string): Promise<Lead | undefined>;
  getLeadByVerificationToken(tokenHash: string): Promise<Lead | undefined>;
  getAllLeads(): Promise<Lead[]>;
  getLeadsByStatus(status: string): Promise<Lead[]>;
  getLeadsPaginated(page: number, limit: number, statusFilter?: string): Promise<{ leads: Lead[], total: number }>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: string, updates: Partial<Lead>): Promise<Lead | undefined>;
  deleteLead(id: string): Promise<boolean>;

  // Lead event operations
  getLeadEvents(leadId: string): Promise<LeadEvent[]>;
  createLeadEvent(event: InsertLeadEvent): Promise<LeadEvent>;

  // Email template operations
  getEmailTemplate(key: string): Promise<EmailTemplate | undefined>;
  getAllEmailTemplates(): Promise<EmailTemplate[]>;
  getEnabledEmailTemplates(): Promise<EmailTemplate[]>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | undefined>;

  // Email queue operations
  getEmailQueue(id: string): Promise<EmailQueue | undefined>;
  getEmailQueueByLead(leadId: string): Promise<EmailQueue[]>;
  getReadyEmails(limit?: number): Promise<EmailQueue[]>;
  getRetryableEmails(limit?: number): Promise<EmailQueue[]>;
  getEmailQueuePaginated(page: number, limit: number, statusFilter?: string, includeFuture?: boolean): Promise<{ emails: EmailQueue[], total: number }>;
  createEmailQueue(emailQueue: InsertEmailQueue): Promise<EmailQueue>;
  updateEmailQueue(id: string, updates: Partial<EmailQueue>): Promise<EmailQueue | undefined>;
  deleteEmailQueue(id: string): Promise<boolean>;

  // Email log operations
  getEmailLogsByLead(leadId: string): Promise<EmailLog[]>;
  createEmailLog(emailLog: InsertEmailLog): Promise<EmailLog>;

  // Payment operations
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByLeadId(leadId: string): Promise<Payment | undefined>;
  getPaymentByScanId(scanId: string): Promise<Payment | undefined>;
  getPaymentByStripeSessionId(sessionId: string): Promise<Payment | undefined>;
  getPaymentByStripePaymentIntentId(paymentIntentId: string): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;

  // Chat message operations
  getChatMessage(id: string): Promise<ChatMessage | undefined>;
  getChatMessagesByConversation(conversationId: string): Promise<ChatMessage[]>;
  getChatMessagesByLeadId(leadId: string): Promise<ChatMessage[]>;
  getChatMessagesByScanId(scanId: string): Promise<ChatMessage[]>;
  createChatMessage(chatMessage: InsertChatMessage): Promise<ChatMessage>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getScanResult(id: string): Promise<ScanResult | undefined> {
    const [result] = await db.select().from(scanResults).where(eq(scanResults.id, id));
    return result || undefined;
  }

  async getAllScanResults(): Promise<ScanResult[]> {
    const results = await db
      .select()
      .from(scanResults)
      .orderBy(desc(scanResults.createdAt));
    return results;
  }

  async createScanResult(insertScanResult: InsertScanResult): Promise<ScanResult> {
    const [result] = await db
      .insert(scanResults)
      .values({
        businessName: insertScanResult.businessName,
        website: insertScanResult.website || null,
        email: insertScanResult.email || null,
        scanData: insertScanResult.scanData || null,
        status: insertScanResult.status || "pending",
      })
      .returning();
    return result;
  }

  async updateScanResult(id: string, updates: Partial<ScanResult>): Promise<ScanResult | undefined> {
    const [result] = await db
      .update(scanResults)
      .set(updates)
      .where(eq(scanResults.id, id))
      .returning();
    return result || undefined;
  }

  // Lead operations implementation
  async getLead(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead || undefined;
  }

  async getLeadByEmail(email: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.email, email));
    return lead || undefined;
  }

  async getLeadByVerificationToken(tokenHash: string): Promise<Lead | undefined> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(
        eq(leads.verificationTokenHash, tokenHash),
        // Check token hasn't expired (24 hours)
        sql`${leads.verificationExpiresAt} > NOW()`
      ));
    return lead || undefined;
  }

  async getAllLeads(): Promise<Lead[]> {
    const results = await db
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt));
    return results;
  }

  async getLeadsByStatus(status: string): Promise<Lead[]> {
    const results = await db
      .select()
      .from(leads)
      .where(eq(leads.status, status))
      .orderBy(desc(leads.createdAt));
    return results;
  }

  async getLeadsPaginated(page: number, limit: number, statusFilter?: string): Promise<{ leads: Lead[], total: number }> {
    const offset = (page - 1) * limit;
    
    // Get leads with pagination
    const whereClause = statusFilter ? eq(leads.status, statusFilter) : undefined;
    
    const leadsResult = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);
    
    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(leads)
      .where(whereClause);
    
    return {
      leads: leadsResult,
      total: countResult[0].count
    };
  }

  async createLead(insertLead: InsertLead): Promise<Lead> {
    // Apply domain filtering
    let domainClassification;
    let emailDomain = null;
    let isPersonalEmail = false;
    let isDisposable = false;
    let leadStatus = insertLead.status || "pending";

    if (insertLead.email) {
      try {
        domainClassification = classifyEmailDomain(insertLead.email);
        emailDomain = domainClassification.domain;
        isPersonalEmail = domainClassification.isPersonal;
        isDisposable = domainClassification.isDisposable;

        // Auto-flag personal or disposable emails
        if (shouldFlagLead(insertLead.email)) {
          leadStatus = "flagged";
        }
      } catch (error) {
        // If email domain classification fails, flag for manual review
        leadStatus = "flagged";
      }
    }

    const [lead] = await db
      .insert(leads)
      .values({
        businessName: insertLead.businessName,
        website: insertLead.website || null,
        contactName: insertLead.contactName || null,
        email: insertLead.email || null,
        role: insertLead.role || null,
        companySize: insertLead.companySize || null,
        industry: insertLead.industry || null,
        budgetRange: insertLead.budgetRange || null,
        timeframe: insertLead.timeframe || null,
        painPoints: insertLead.painPoints || null,
        emailDomain,
        status: leadStatus,
        isPersonalEmail,
        isDisposable,
        recaptchaScore: insertLead.recaptchaScore || null,
        verificationTokenHash: insertLead.verificationTokenHash || null,
        verificationExpiresAt: insertLead.verificationExpiresAt || null,
        lastContactedAt: insertLead.lastContactedAt || null,
      })
      .returning();

    // Log domain filtering event if email was flagged
    if (insertLead.email && (isPersonalEmail || isDisposable)) {
      await this.createLeadEvent({
        leadId: lead.id,
        eventType: "domain_flagged",
        details: {
          reason: getFlaggingReason(insertLead.email),
          domain: emailDomain,
          isPersonal: isPersonalEmail,
          isDisposable,
        },
      });
    }

    return lead;
  }

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead | undefined> {
    // If email is being updated, re-check domain classification
    if (updates.email) {
      try {
        const domainClassification = classifyEmailDomain(updates.email);
        updates.emailDomain = domainClassification.domain;
        updates.isPersonalEmail = domainClassification.isPersonal;
        updates.isDisposable = domainClassification.isDisposable;

        // Auto-flag if necessary
        if (shouldFlagLead(updates.email) && updates.status !== "flagged") {
          updates.status = "flagged";
        }
      } catch (error) {
        // If email domain classification fails, flag for manual review
        updates.status = "flagged";
      }
    }

    const [lead] = await db
      .update(leads)
      .set(updates)
      .where(eq(leads.id, id))
      .returning();

    // Log domain filtering event if email was updated and flagged
    if (lead && updates.email && (updates.isPersonalEmail || updates.isDisposable)) {
      await this.createLeadEvent({
        leadId: lead.id,
        eventType: "domain_flagged",
        details: {
          reason: getFlaggingReason(updates.email),
          domain: updates.emailDomain,
          isPersonal: updates.isPersonalEmail,
          isDisposable: updates.isDisposable,
        },
      });
    }

    return lead || undefined;
  }

  async deleteLead(id: string): Promise<boolean> {
    const result = await db.delete(leads).where(eq(leads.id, id)).returning();
    return result.length > 0;
  }

  // Lead event operations implementation
  async getLeadEvents(leadId: string): Promise<LeadEvent[]> {
    const events = await db
      .select()
      .from(leadEvents)
      .where(eq(leadEvents.leadId, leadId))
      .orderBy(desc(leadEvents.createdAt));
    return events;
  }

  async createLeadEvent(insertEvent: InsertLeadEvent): Promise<LeadEvent> {
    const [event] = await db
      .insert(leadEvents)
      .values({
        leadId: insertEvent.leadId,
        eventType: insertEvent.eventType,
        details: insertEvent.details || null,
      })
      .returning();
    return event;
  }

  // Email template operations implementation
  async getEmailTemplate(key: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key));
    return template || undefined;
  }

  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    const templates = await db.select().from(emailTemplates).orderBy(asc(emailTemplates.step));
    return templates;
  }

  async getEnabledEmailTemplates(): Promise<EmailTemplate[]> {
    const templates = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.enabled, true))
      .orderBy(asc(emailTemplates.step));
    return templates;
  }

  async createEmailTemplate(insertTemplate: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await db
      .insert(emailTemplates)
      .values(insertTemplate)
      .returning();
    return template;
  }

  async updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const [template] = await db
      .update(emailTemplates)
      .set(updates)
      .where(eq(emailTemplates.id, id))
      .returning();
    return template || undefined;
  }

  // Email queue operations implementation
  async getEmailQueue(id: string): Promise<EmailQueue | undefined> {
    const [emailQueueItem] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    return emailQueueItem || undefined;
  }

  async getEmailQueueByLead(leadId: string): Promise<EmailQueue[]> {
    const items = await db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.leadId, leadId))
      .orderBy(asc(emailQueue.scheduledAt));
    return items;
  }

  async getReadyEmails(limit: number = 10): Promise<EmailQueue[]> {
    const items = await db
      .select()
      .from(emailQueue)
      .where(and(
        eq(emailQueue.status, "pending"),
        sql`${emailQueue.scheduledAt} <= NOW()`
      ))
      .orderBy(asc(emailQueue.scheduledAt))
      .limit(limit);
    return items;
  }

  async getRetryableEmails(limit: number = 10): Promise<EmailQueue[]> {
    const items = await db
      .select()
      .from(emailQueue)
      .where(and(
        eq(emailQueue.status, "retrying"),
        sql`${emailQueue.nextRetryAt} <= NOW()`
      ))
      .orderBy(asc(emailQueue.nextRetryAt))
      .limit(limit);
    return items;
  }

  async createEmailQueue(insertEmailQueue: InsertEmailQueue): Promise<EmailQueue> {
    const [emailQueueItem] = await db
      .insert(emailQueue)
      .values(insertEmailQueue)
      .returning();
    return emailQueueItem;
  }

  async updateEmailQueue(id: string, updates: Partial<EmailQueue>): Promise<EmailQueue | undefined> {
    const [emailQueueItem] = await db
      .update(emailQueue)
      .set(updates)
      .where(eq(emailQueue.id, id))
      .returning();
    return emailQueueItem || undefined;
  }

  async deleteEmailQueue(id: string): Promise<boolean> {
    const result = await db.delete(emailQueue).where(eq(emailQueue.id, id)).returning();
    return result.length > 0;
  }

  async getEmailQueuePaginated(page: number, limit: number, statusFilter?: string, includeFuture: boolean = false): Promise<{ emails: EmailQueue[], total: number }> {
    const offset = (page - 1) * limit;
    
    // Build where clause based on filters
    let whereConditions = [];
    
    // Filter by status if provided
    if (statusFilter) {
      whereConditions.push(eq(emailQueue.status, statusFilter));
    }
    
    // By default, exclude future-scheduled items unless explicitly requested
    if (!includeFuture) {
      whereConditions.push(
        or(
          lte(emailQueue.scheduledAt, sql`NOW()`),
          eq(emailQueue.status, 'sent'),
          eq(emailQueue.status, 'failed')
        )
      );
    }
    
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    
    // Get emails with pagination
    const emailsResult = await db
      .select()
      .from(emailQueue)
      .where(whereClause)
      .orderBy(desc(emailQueue.scheduledAt))
      .limit(limit)
      .offset(offset);
    
    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(emailQueue)
      .where(whereClause);
    
    return {
      emails: emailsResult,
      total: countResult[0].count
    };
  }

  // Email log operations implementation
  async getEmailLogsByLead(leadId: string): Promise<EmailLog[]> {
    const logs = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.leadId, leadId))
      .orderBy(desc(emailLog.sentAt));
    return logs;
  }

  async createEmailLog(insertEmailLog: InsertEmailLog): Promise<EmailLog> {
    const [emailLogItem] = await db
      .insert(emailLog)
      .values(insertEmailLog)
      .returning();
    return emailLogItem;
  }

  // Payment operations implementation
  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPaymentByLeadId(leadId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.leadId, leadId))
      .orderBy(desc(payments.createdAt));
    return payment || undefined;
  }

  async getPaymentByScanId(scanId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.scanId, scanId))
      .orderBy(desc(payments.createdAt));
    return payment || undefined;
  }

  async getPaymentByStripeSessionId(sessionId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeSessionId, sessionId));
    return payment || undefined;
  }

  async getPaymentByStripePaymentIntentId(paymentIntentId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, paymentIntentId));
    return payment || undefined;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values({
        leadId: insertPayment.leadId,
        scanId: insertPayment.scanId || null,
        amount: insertPayment.amount,
        currency: insertPayment.currency || "usd",
        status: insertPayment.status || "initialized",
        stripeSessionId: insertPayment.stripeSessionId || null,
        stripePaymentIntentId: insertPayment.stripePaymentIntentId || null,
      })
      .returning();
    return payment;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [payment] = await db
      .update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();
    return payment || undefined;
  }

  // Chat message operations implementation
  async getChatMessage(id: string): Promise<ChatMessage | undefined> {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return message || undefined;
  }

  async getChatMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt));
    return messages;
  }

  async getChatMessagesByLeadId(leadId: string): Promise<ChatMessage[]> {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.leadId, leadId))
      .orderBy(asc(chatMessages.createdAt));
    return messages;
  }

  async getChatMessagesByScanId(scanId: string): Promise<ChatMessage[]> {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.scanId, scanId))
      .orderBy(asc(chatMessages.createdAt));
    return messages;
  }

  async createChatMessage(insertChatMessage: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values({
        conversationId: insertChatMessage.conversationId,
        scanId: insertChatMessage.scanId || null,
        leadId: insertChatMessage.leadId || null,
        role: insertChatMessage.role,
        content: insertChatMessage.content,
        metadata: insertChatMessage.metadata || null,
      })
      .returning();
    return message;
  }
}

export const storage = new DatabaseStorage();
