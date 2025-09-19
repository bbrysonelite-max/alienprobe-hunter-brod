import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScanResultSchema, insertLeadSchema } from "@shared/schema";
import { z } from "zod";
import { healthCheck, livenessProbe, readinessProbe, metricsEndpoint, simulateError } from "./monitoring";
import { logger } from "./logger";
import crypto from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes for Alien Probe business scanning
  
  // Create a new scan (both /api/scan and /api/free-scan for compatibility)
  const handleScanRequest = async (req: Request, res: Response) => {
    try {
      const validatedData = insertScanResultSchema.parse(req.body);
      
      logger.info('Scan request initiated', { 
        businessName: validatedData.businessName,
        hasWebsite: !!validatedData.website,
        hasEmail: !!validatedData.email,
      });
      
      // Simulate business scanning process
      const scanResult = await storage.createScanResult({
        ...validatedData,
        status: "scanning",
        scanData: JSON.stringify({
          timestamp: new Date().toISOString(),
          websiteAnalysis: validatedData.website ? "Website found and analyzed" : "No website provided",
          businessScore: Math.floor(Math.random() * 100) + 1,
        }),
      });

      logger.info('Scan result created', { scanId: scanResult.id, status: 'scanning' });

      // Simulate async processing completion
      setTimeout(async () => {
        try {
          await storage.updateScanResult(scanResult.id, { 
            status: "completed",
            scanData: JSON.stringify({
              ...JSON.parse(scanResult.scanData || "{}"),
              completed: true,
              insights: [
                "Strong online presence detected",
                "Potential for digital expansion",
                "Competitive market position",
              ],
            }),
          });
          logger.info('Scan processing completed', { scanId: scanResult.id });
        } catch (error) {
          logger.error('Scan processing failed', error as Error, { scanId: scanResult.id });
          await storage.updateScanResult(scanResult.id, { status: "failed" });
        }
      }, 2000);

      res.json({ 
        success: true, 
        scanId: scanResult.id,
        message: "Scan initiated successfully" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Scan request validation failed', { errors: error.errors });
        res.status(400).json({ 
          success: false, 
          error: "Validation failed", 
          details: error.errors 
        });
      } else {
        logger.error('Scan request failed', error as Error);
        res.status(500).json({ 
          success: false, 
          error: "Internal server error" 
        });
      }
    }
  };

  // Register the route for both endpoints
  app.post("/api/scan", handleScanRequest);
  app.post("/api/free-scan", handleScanRequest);

  // Lead intake endpoint
  app.post("/api/leads", async (req: Request, res: Response) => {
    try {
      const validatedData = insertLeadSchema.parse(req.body);
      
      logger.info('Lead submission initiated', { 
        businessName: validatedData.businessName,
        hasEmail: !!validatedData.email,
        industry: validatedData.industry,
        companySize: validatedData.companySize
      });

      // Generate verification token if email is provided
      let verificationToken = null;
      let verificationTokenHash = null;
      let verificationExpiresAt = null;
      
      if (validatedData.email) {
        // Generate a secure random token (32 bytes = 64 hex chars)
        verificationToken = crypto.randomBytes(32).toString('hex');
        // Hash the token for secure storage
        verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
        // Set expiry to 24 hours from now
        verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      // Create lead in database (domain filtering is handled in storage)
      const lead = await storage.createLead({
        ...validatedData,
        verificationTokenHash,
        verificationExpiresAt,
      });

      logger.info('Lead created successfully', { 
        leadId: lead.id, 
        status: lead.status,
        isPersonalEmail: lead.isPersonalEmail,
        isDisposable: lead.isDisposable
      });

      // Log lead creation event
      await storage.createLeadEvent({
        leadId: lead.id,
        eventType: "lead_created",
        details: {
          source: "api",
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          hasVerificationToken: !!verificationToken
        }
      });

      // Send verification email in real implementation
      // Log verification initiation without exposing sensitive token
      if (verificationToken && validatedData.email) {
        const verificationUrl = `${req.protocol}://${req.get('host')}/api/verify-email?token=${verificationToken}`;
        logger.info('Verification email initiated', { 
          leadId: lead.id, 
          emailDomain: validatedData.email.split('@')[1],
          verificationTokenLength: verificationToken.length
        });
      }

      res.json({ 
        success: true, 
        leadId: lead.id,
        status: lead.status,
        message: lead.status === "flagged" ? "Lead created but requires review" : "Lead created successfully",
        ...(verificationToken && { 
          message: "Lead created successfully. Please check your email for verification.",
          verificationRequired: true 
        })
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Lead submission validation failed', { errors: error.errors });
        res.status(400).json({ 
          success: false, 
          error: "Validation failed", 
          details: error.errors 
        });
      } else {
        logger.error('Lead submission failed', error as Error);
        res.status(500).json({ 
          success: false, 
          error: "Internal server error" 
        });
      }
    }
  });

  // Get all scan results
  app.get("/api/results", async (req, res) => {
    try {
      const results = await storage.getAllScanResults();
      logger.info('Scan results retrieved', { count: results.length });
      res.json(results);
    } catch (error) {
      logger.error('Failed to fetch scan results', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch results" 
      });
    }
  });

  // Get specific scan result
  app.get("/api/results/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getScanResult(id);
      
      if (!result) {
        logger.warn('Scan result not found', { scanId: id });
        res.status(404).json({ 
          success: false, 
          error: "Scan result not found" 
        });
        return;
      }

      logger.info('Scan result retrieved', { scanId: id, status: result.status });
      res.json(result);
    } catch (error) {
      logger.error('Failed to fetch scan result', error as Error, { scanId: req.params.id });
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch result" 
      });
    }
  });

  // Email verification endpoint
  app.get("/api/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        logger.warn('Email verification attempted without token');
        res.status(400).json({ 
          success: false, 
          error: "Verification token is required" 
        });
        return;
      }

      // Hash the provided token to match stored hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Look up lead by verification token hash
      const lead = await storage.getLeadByVerificationToken(tokenHash);
      
      if (!lead) {
        logger.warn('Email verification failed - invalid or expired token', { tokenHash: tokenHash.substring(0, 8) + '...' });
        res.status(400).json({ 
          success: false, 
          error: "Invalid or expired verification token" 
        });
        return;
      }

      // Mark lead as verified and clear verification token
      const updatedLead = await storage.updateLead(lead.id, {
        status: "verified",
        verificationTokenHash: null,
        verificationExpiresAt: null
      });

      if (!updatedLead) {
        logger.error('Failed to update lead after verification', { leadId: lead.id });
        res.status(500).json({ 
          success: false, 
          error: "Failed to complete verification" 
        });
        return;
      }

      // Log verification event
      await storage.createLeadEvent({
        leadId: lead.id,
        eventType: "email_verified",
        details: {
          verifiedAt: new Date().toISOString(),
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      logger.info('Email verification successful', { 
        leadId: lead.id, 
        email: lead.email 
      });

      res.json({ 
        success: true, 
        message: "Email verified successfully",
        leadId: lead.id
      });
    } catch (error) {
      logger.error('Email verification failed', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  // Admin endpoint to get leads with pagination and filtering
  app.get("/api/leads", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page
      const status = req.query.status as string;
      
      logger.info('Admin leads request', { page, limit, status });
      
      // Get paginated leads
      const { leads, total } = await storage.getLeadsPaginated(page, limit, status);
      
      // Get event counts for each lead (for future use)
      const leadsWithEventCounts = await Promise.all(
        leads.map(async (lead) => {
          const events = await storage.getLeadEvents(lead.id);
          return {
            ...lead,
            eventCount: events.length,
            lastEventAt: events[0]?.createdAt || null
          };
        })
      );
      
      const totalPages = Math.ceil(total / limit);
      
      logger.info('Admin leads response', { 
        leadsCount: leads.length, 
        total, 
        page, 
        totalPages 
      });
      
      res.json({
        success: true,
        data: leadsWithEventCounts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          status: status || null
        }
      });
    } catch (error) {
      logger.error('Failed to fetch leads', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch leads" 
      });
    }
  });

  // Email management endpoints
  
  // Get email queue status with comprehensive filtering
  app.get("/api/email/queue", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const status = req.query.status as string;
      const includeFuture = req.query.includeFuture === 'true';
      
      // Use the enhanced storage method for proper database-level filtering
      const { emails, total } = await storage.getEmailQueuePaginated(page, limit, status, includeFuture);
      
      const totalPages = Math.ceil(total / limit);
      
      logger.info('Email queue retrieved', { 
        count: emails.length, 
        total,
        page, 
        limit, 
        status,
        includeFuture
      });
      
      res.json({
        success: true,
        data: emails,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          status: status || null,
          includeFuture: includeFuture
        }
      });
    } catch (error) {
      logger.error('Failed to get email queue', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get email queue" 
      });
    }
  });

  // Manually trigger email processing (for testing)
  app.post("/api/email/process", async (req: Request, res: Response) => {
    try {
      logger.info('Manual email processing triggered');
      
      // Import processor dynamically to avoid circular dependencies
      const { emailProcessor } = await import('./email/processor');
      
      // Check if processor is running
      const status = emailProcessor.getStatus();
      if (!status.isRunning) {
        res.status(400).json({
          success: false,
          error: "Email processor is not running"
        });
        return;
      }
      
      // Actually trigger processing and get results
      const result = await emailProcessor.triggerNow();
      
      res.json({
        success: true,
        message: "Email processing completed",
        processed: result.processed,
        failed: result.failed,
        processorStatus: emailProcessor.getStatus()
      });
    } catch (error) {
      logger.error('Failed to trigger email processing', error as Error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to trigger email processing" 
      });
    }
  });

  // Schedule test email for a lead
  app.post("/api/email/test/:leadId", async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { templateKey, delay } = req.body;
      
      const lead = await storage.getLead(leadId);
      if (!lead) {
        res.status(404).json({ 
          success: false, 
          error: "Lead not found" 
        });
        return;
      }

      if (!lead.email) {
        res.status(400).json({ 
          success: false, 
          error: "Lead has no email address" 
        });
        return;
      }

      // Import scheduler dynamically
      const { emailScheduler } = await import('./email/scheduler');
      
      // Schedule the email based on template type
      if (templateKey === 'welcome') {
        await emailScheduler.scheduleWelcomeEmail(lead);
      } else if (templateKey === 'verification') {
        await emailScheduler.scheduleVerificationEmail(lead);
      } else {
        // Generic email with custom delay
        const delayMinutes = parseInt(delay) || 0;
        await storage.createEmailQueue({
          leadId: lead.id,
          templateKey: templateKey || 'welcome',
          scheduledAt: new Date(Date.now() + (delayMinutes * 60 * 1000)),
          status: 'pending',
          retryCount: 0
        });
      }

      logger.info('Test email scheduled', { 
        leadId, 
        templateKey, 
        email: lead.email 
      });

      res.json({
        success: true,
        message: "Test email scheduled",
        leadId: lead.id,
        templateKey: templateKey || 'welcome'
      });
    } catch (error) {
      logger.error('Failed to schedule test email', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to schedule test email" 
      });
    }
  });

  // Cancel pending emails for a lead
  app.delete("/api/email/lead/:leadId", async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      
      const lead = await storage.getLead(leadId);
      if (!lead) {
        res.status(404).json({ 
          success: false, 
          error: "Lead not found" 
        });
        return;
      }

      // Import scheduler dynamically
      const { emailScheduler } = await import('./email/scheduler');
      await emailScheduler.cancelLeadEmails(leadId);

      logger.info('Lead emails cancelled', { leadId });

      res.json({
        success: true,
        message: "Lead emails cancelled",
        leadId
      });
    } catch (error) {
      logger.error('Failed to cancel lead emails', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to cancel lead emails" 
      });
    }
  });

  // Get email logs for a lead
  app.get("/api/email/logs/:leadId", async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      
      const lead = await storage.getLead(leadId);
      if (!lead) {
        res.status(404).json({ 
          success: false, 
          error: "Lead not found" 
        });
        return;
      }

      const logs = await storage.getEmailLogsByLead(leadId);
      
      logger.info('Email logs retrieved', { leadId, logCount: logs.length });

      res.json({
        success: true,
        data: logs,
        leadId
      });
    } catch (error) {
      logger.error('Failed to get email logs', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get email logs" 
      });
    }
  });

  // Health and monitoring endpoints
  app.get("/api/health", healthCheck);
  app.get("/api/health/live", livenessProbe);
  app.get("/api/health/ready", readinessProbe);
  app.get("/api/metrics", metricsEndpoint);
  
  // Development-only error simulation endpoint
  app.get("/api/simulate-error", simulateError);

  const httpServer = createServer(app);
  return httpServer;
}
