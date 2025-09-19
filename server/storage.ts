import { 
  users, 
  scanResults, 
  leads, 
  leadEvents,
  type User, 
  type InsertUser, 
  type ScanResult, 
  type InsertScanResult,
  type Lead,
  type InsertLead,
  type LeadEvent,
  type InsertLeadEvent
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql, asc } from "drizzle-orm";
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
}

export const storage = new DatabaseStorage();
