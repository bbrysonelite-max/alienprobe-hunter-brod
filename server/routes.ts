import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertScanResultSchema, 
  insertLeadSchema, 
  insertPaymentSchema,
  insertChatMessageSchema,
  insertWorkflowSchema,
  insertWorkflowVersionSchema,
  insertWorkflowRunSchema,
  insertWorkflowRunStepSchema,
  type Workflow,
  type WorkflowVersion,
  type WorkflowRun,
  type WorkflowRunStep
} from "@shared/schema";
import { z } from "zod";
import { healthCheck, livenessProbe, readinessProbe, metricsEndpoint, simulateError } from "./monitoring";
import { logger } from "./logger";
import crypto from "crypto";
import Stripe from "stripe";
import { processChatMessage, isChatEnabled } from "./chat";
import { WorkflowExecutor } from "./workflows/executor";

// Initialize Stripe if secret key is present
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PAYMENT_LINK_URL = process.env.STRIPE_PAYMENT_LINK_URL;
const FULL_SCAN_PRICE_AMOUNT = parseInt(process.env.FULL_SCAN_PRICE_AMOUNT || "4900"); // Default $49.00

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil", // Use latest API version
}) : null;

const paymentsEnabled = !!STRIPE_SECRET_KEY;

// Initialize Workflow Executor
const workflowExecutor = new WorkflowExecutor();

// Basic authentication middleware for admin endpoints
const requireAuth = (req: Request, res: Response, next: Function) => {
  // Basic role validation - in a real app this would check JWT tokens, sessions, etc.
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  // For development, allow requests with basic API key or admin role
  if (apiKey === process.env.ADMIN_API_KEY || 
      authHeader === 'Bearer admin-token' ||
      (req as any).user?.role === 'admin') {
    next();
  } else {
    res.status(401).json({
      success: false,
      error: "Unauthorized - Admin access required"
    });
  }
};

// Rate limiting map for admin endpoints (simple in-memory implementation)
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const rateLimit = (maxRequests: number = 100, windowMs: number = 60000) => {
  return (req: Request, res: Response, next: Function) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const limit = rateLimits.get(key);
    
    if (!limit || now > limit.resetTime) {
      rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      next();
    } else if (limit.count < maxRequests) {
      limit.count++;
      next();
    } else {
      res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later."
      });
    }
  };
};

// Validation schemas for workflow endpoints
const paginationSchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).refine(val => val > 0, "Page must be positive").default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100").default('20')
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1, "Workflow name is required").optional(),
  businessType: z.string().optional(),
  isDefault: z.boolean().optional()
});

const updateWorkflowVersionSchema = z.object({
  definition: z.any().optional(),
  status: z.enum(["draft", "published"]).optional()
});

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

      // **Integration Changes: Look up default workflow by businessType and enqueue workflow run**
      try {
        // Determine business type from scan data (this could be enhanced with ML/AI classification)
        let businessType: string | undefined;
        if (validatedData.website) {
          const domain = validatedData.website.toLowerCase();
          // Simple business type classification based on domain/business name
          if (domain.includes('restaurant') || domain.includes('food') || validatedData.businessName.toLowerCase().includes('restaurant')) {
            businessType = 'restaurant';
          } else if (domain.includes('retail') || domain.includes('shop') || domain.includes('store')) {
            businessType = 'retail';
          } else if (domain.includes('tech') || domain.includes('software') || domain.includes('app')) {
            businessType = 'technology';
          } else {
            businessType = 'general';
          }
        } else {
          businessType = 'general'; // Default business type
        }

        logger.info('Determined business type for workflow', { 
          scanId: scanResult.id, 
          businessType,
          businessName: validatedData.businessName 
        });

        // Look up default workflow by businessType
        const defaultWorkflow = businessType ? 
          await storage.getPublishedWorkflowByBusinessType(businessType) :
          await storage.getDefaultPublishedWorkflow();

        if (defaultWorkflow) {
          logger.info('Found default workflow for execution', { 
            scanId: scanResult.id,
            businessType,
            workflowId: defaultWorkflow.workflowId,
            workflowVersionId: defaultWorkflow.id
          });

          // Enqueue workflow run with scanId and context data
          const workflowQueueId = await workflowExecutor.executeWorkflow(businessType, {
            scanId: scanResult.id,
            leadId: undefined, // Will be set if lead is created later
            data: {
              businessName: validatedData.businessName,
              website: validatedData.website,
              email: validatedData.email,
              scanData: JSON.parse(scanResult.scanData || "{}"),
              businessType
            },
            metadata: {
              startTime: new Date(),
              attempt: 1
            }
          });

          logger.info('Workflow execution queued successfully', { 
            scanId: scanResult.id,
            workflowQueueId,
            businessType
          });
        } else {
          // Fallback: No workflow found, use simple processing simulation
          logger.warn('No default workflow found, falling back to simple processing', { 
            scanId: scanResult.id,
            businessType 
          });

          // Fallback simulation processing
          setTimeout(async () => {
            try {
              await storage.updateScanResult(scanResult.id, { 
                status: "completed",
                scanData: JSON.stringify({
                  ...JSON.parse(scanResult.scanData || "{}"),
                  completed: true,
                  insights: [
                    "Basic scan completed (no workflow available)",
                    "Consider setting up workflows for enhanced analysis",
                    "Contact support for custom workflow configuration",
                  ],
                  businessType,
                  processedWithoutWorkflow: true
                }),
              });
              logger.info('Fallback scan processing completed', { scanId: scanResult.id });
            } catch (error) {
              logger.error('Fallback scan processing failed', error as Error, { scanId: scanResult.id });
              await storage.updateScanResult(scanResult.id, { status: "failed" });
            }
          }, 2000);
        }

      } catch (workflowError) {
        // Handle workflow execution errors gracefully
        logger.error('Workflow integration failed, falling back to simple processing', workflowError as Error, { 
          scanId: scanResult.id 
        });

        // Fallback to simple processing if workflow fails
        setTimeout(async () => {
          try {
            await storage.updateScanResult(scanResult.id, { 
              status: "completed",
              scanData: JSON.stringify({
                ...JSON.parse(scanResult.scanData || "{}"),
                completed: true,
                insights: [
                  "Scan completed with basic processing",
                  "Workflow processing encountered issues",
                  "Results may be limited - please try again",
                ],
                workflowError: "Workflow execution failed, used fallback processing"
              }),
            });
            logger.info('Fallback scan processing completed after workflow error', { scanId: scanResult.id });
          } catch (error) {
            logger.error('Fallback scan processing failed', error as Error, { scanId: scanResult.id });
            await storage.updateScanResult(scanResult.id, { status: "failed" });
          }
        }, 2000);
      }

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
        verificationTokenHash: verificationTokenHash || undefined,
        verificationExpiresAt: verificationExpiresAt || undefined,
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

  // Get specific scan result with payment-based content gating
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

      // Check payment access for content gating
      let hasAccess = false;
      
      // First try to find payment by scanId
      let payment = await storage.getPaymentByScanId(id);
      let lead = null;
      
      if (payment) {
        // If payment exists with scanId, get the associated lead
        lead = await storage.getLead(payment.leadId);
        hasAccess = payment.status === "paid";
      } else {
        // Fallback: treat scanId as leadId for backwards compatibility
        lead = await storage.getLead(id);
        if (lead) {
          payment = await storage.getPaymentByLeadId(lead.id);
          hasAccess = payment?.status === "paid" || lead.status === "converted";
        }
      }

      // Prepare response with content gating
      let responseData = { ...result };
      
      if (!hasAccess && result.scanData) {
        // Redact premium content for unpaid users
        try {
          const scanData = JSON.parse(result.scanData);
          const redactedScanData = {
            timestamp: scanData.timestamp,
            websiteAnalysis: scanData.websiteAnalysis,
            businessScore: scanData.businessScore,
            // Remove premium content
            insights: scanData.insights ? ["Premium insights available after purchase"] : [],
            completed: scanData.completed,
            // Add indicator that more content is available
            premiumContentAvailable: true,
            totalInsights: Array.isArray(scanData.insights) ? scanData.insights.length : 0
          };
          responseData.scanData = JSON.stringify(redactedScanData);
        } catch (parseError) {
          // If scan data can't be parsed, keep original but add warning
          logger.warn('Failed to parse scan data for content gating', { scanId: id, error: parseError });
        }
      }

      logger.info('Scan result retrieved with content gating', { 
        scanId: id, 
        status: result.status, 
        hasAccess,
        hasPayment: !!payment,
        leadId: lead?.id 
      });
      
      res.json(responseData);
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
        logger.error('Failed to update lead after verification', new Error('Lead update failed'), { leadId: lead.id });
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

  // Payment configuration endpoint
  app.get("/api/payments/config", async (req: Request, res: Response) => {
    try {
      const publishableKeyPresent = !!process.env.VITE_STRIPE_PUBLIC_KEY;
      
      logger.info('Payment config requested', { 
        paymentsEnabled, 
        publishableKeyPresent 
      });

      res.json({
        success: true,
        paymentsEnabled,
        publishableKeyPresent,
        paymentLinkUrl: STRIPE_PAYMENT_LINK_URL,
        ...(paymentsEnabled && {
          publicKey: process.env.VITE_STRIPE_PUBLIC_KEY,
          currency: "usd",
          defaultAmount: FULL_SCAN_PRICE_AMOUNT
        })
      });
    } catch (error) {
      logger.error('Payment config request failed', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get payment configuration" 
      });
    }
  });

  // Create Stripe Checkout Session with idempotency and scanId support
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    try {
      if (!paymentsEnabled || !stripe) {
        logger.warn('Payment checkout attempted but payments are disabled');
        res.status(400).json({ 
          success: false, 
          error: "Payments are not enabled" 
        });
        return;
      }

      const { leadId, scanId } = req.body;
      
      if (!leadId && !scanId) {
        res.status(400).json({ 
          success: false, 
          error: "Lead ID or Scan ID is required" 
        });
        return;
      }

      // Enhanced lead lookup with robust fallback logic
      let lead;
      let resolvedId;
      let lookupMethod;

      // Primary lookup attempt
      if (leadId) {
        lead = await storage.getLead(leadId);
        if (lead) {
          resolvedId = leadId;
          lookupMethod = "leadId";
        } else if (scanId) {
          // Fallback: if leadId lookup failed but scanId exists, try scanId flow
          logger.info('LeadId lookup failed, attempting scanId fallback', { leadId, scanId });
          
          // First try to find existing payment by scanId
          const existingPaymentByScan = await storage.getPaymentByScanId(scanId);
          if (existingPaymentByScan) {
            lead = await storage.getLead(existingPaymentByScan.leadId);
            if (lead) {
              resolvedId = scanId;
              lookupMethod = "scanId-via-payment";
            }
          }
          
          // If still no lead, try treating scanId as leadId (backwards compatibility)
          if (!lead) {
            lead = await storage.getLead(scanId);
            if (lead) {
              resolvedId = scanId;
              lookupMethod = "scanId-as-leadId";
            }
          }
        }
      } else if (scanId) {
        // Pure scanId flow - multiple strategies
        
        // Strategy 1: Find existing payment by scanId
        const existingPaymentByScan = await storage.getPaymentByScanId(scanId);
        if (existingPaymentByScan) {
          lead = await storage.getLead(existingPaymentByScan.leadId);
          if (lead) {
            resolvedId = scanId;
            lookupMethod = "scanId-via-payment";
          }
        }
        
        // Strategy 2: Treat scanId as leadId (backwards compatibility)
        if (!lead) {
          lead = await storage.getLead(scanId);
          if (lead) {
            resolvedId = scanId;
            lookupMethod = "scanId-as-leadId";
          }
        }
        
        // Strategy 3: Check if scanId corresponds to a valid scan result
        if (!lead) {
          const scanResult = await storage.getScanResult(scanId);
          if (scanResult) {
            // For valid scans without leads, we could create a minimal lead
            // For now, just provide a better error message
            logger.warn('Valid scan found but no associated lead for payment', { scanId });
            res.status(400).json({ 
              success: false, 
              error: "This scan does not have an associated lead for payment. Please contact support.",
              scanId: scanId,
              hasScanResult: true
            });
            return;
          }
        }
      }
      
      if (!lead) {
        logger.warn('No valid lead found for checkout', { leadId, scanId, lookupMethod });
        res.status(404).json({ 
          success: false, 
          error: leadId && scanId 
            ? "Neither Lead ID nor Scan ID could be resolved to a valid lead"
            : leadId 
              ? "Lead not found"
              : "Scan not found or not associated with a lead",
          providedLeadId: leadId || null,
          providedScanId: scanId || null
        });
        return;
      }

      logger.info('Lead successfully resolved for checkout', { 
        leadId: lead.id,
        resolvedId,
        lookupMethod,
        providedLeadId: leadId,
        providedScanId: scanId
      });

      // Check for existing payments - improved idempotency
      const existingPayment = await storage.getPaymentByLeadId(lead.id);
      
      if (existingPayment) {
        if (existingPayment.status === "paid") {
          res.status(400).json({ 
            success: false, 
            error: "Payment already completed for this lead",
            paymentId: existingPayment.id
          });
          return;
        }
        
        // If payment is initialized and has a valid Stripe session, reuse it
        if (existingPayment.status === "initialized" && existingPayment.stripeSessionId) {
          try {
            const existingSession = await stripe.checkout.sessions.retrieve(existingPayment.stripeSessionId);
            if (existingSession.status === 'open') {
              logger.info('Reusing existing checkout session', { 
                leadId: lead.id,
                scanId,
                paymentId: existingPayment.id,
                sessionId: existingSession.id
              });
              
              res.json({ 
                success: true, 
                sessionId: existingSession.id,
                checkoutUrl: existingSession.url,
                paymentId: existingPayment.id
              });
              return;
            }
          } catch (error) {
            logger.warn('Existing session invalid, creating new one', { 
              sessionId: existingPayment.stripeSessionId,
              error: (error as Error).message
            });
          }
        }
      }

      logger.info('Creating Stripe checkout session', { 
        leadId: lead.id,
        scanId, 
        businessName: lead.businessName,
        amount: FULL_SCAN_PRICE_AMOUNT
      });

      // Generate idempotency key
      const idempotencyKey = `checkout_${lead.id}_${Date.now()}`;

      // Create Stripe Checkout Session with idempotency
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Full Business Scan Report',
                description: `Complete business analysis for ${lead.businessName}`,
              },
              unit_amount: FULL_SCAN_PRICE_AMOUNT,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment-cancel`,
        metadata: {
          leadId: lead.id,
          scanId: scanId || '',
          businessName: lead.businessName,
        },
        customer_email: lead.email || undefined,
      }, {
        idempotencyKey: idempotencyKey
      });

      // Create or update payment record in database
      let payment;
      if (existingPayment) {
        payment = await storage.updatePayment(existingPayment.id, {
          stripeSessionId: session.id,
          status: 'initialized',
          scanId: scanId || existingPayment.scanId
        });
      } else {
        payment = await storage.createPayment({
          leadId: lead.id,
          scanId: scanId || undefined,
          amount: FULL_SCAN_PRICE_AMOUNT,
          currency: 'usd',
          status: 'initialized',
          stripeSessionId: session.id,
        });
      }

      logger.info('Stripe checkout session created', { 
        leadId: lead.id,
        scanId,
        paymentId: payment?.id,
        sessionId: session.id,
        idempotencyKey
      });

      res.json({ 
        success: true, 
        sessionId: session.id,
        checkoutUrl: session.url,
        paymentId: payment?.id
      });
    } catch (error) {
      logger.error('Payment checkout failed', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to create checkout session" 
      });
    }
  });

  // Get payment status by scanId (handles scanId to leadId mapping)
  app.get("/api/payments/status/:scanId", async (req: Request, res: Response) => {
    try {
      const { scanId } = req.params;
      
      // First try to get payment by scanId
      let payment = await storage.getPaymentByScanId(scanId);
      let lead = null;
      
      if (payment) {
        // If payment exists with scanId, get the associated lead
        lead = await storage.getLead(payment.leadId);
      } else {
        // Fallback: treat scanId as leadId for backwards compatibility
        lead = await storage.getLead(scanId);
        if (lead) {
          payment = await storage.getPaymentByLeadId(lead.id);
        }
      }
      
      if (!lead) {
        res.status(404).json({ 
          success: false, 
          error: "Scan or lead not found" 
        });
        return;
      }

      const hasAccess = payment?.status === "paid" || lead.status === "converted";
      
      logger.info('Payment status check', { 
        scanId,
        leadId: lead.id, 
        hasPayment: !!payment,
        paymentStatus: payment?.status,
        leadStatus: lead.status,
        hasAccess
      });

      res.json({
        success: true,
        hasAccess,
        payment: payment ? {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          createdAt: payment.createdAt
        } : null,
        lead: {
          id: lead.id,
          status: lead.status,
          businessName: lead.businessName
        }
      });
    } catch (error) {
      logger.error('Payment status check failed', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to check payment status" 
      });
    }
  });

  // Backend confirmation endpoint for payment success page
  app.get("/api/payments/confirm/:sessionId", async (req: Request, res: Response) => {
    try {
      if (!paymentsEnabled || !stripe) {
        res.status(400).json({ 
          success: false, 
          error: "Payments are not enabled" 
        });
        return;
      }

      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({ 
          success: false, 
          error: "Session ID is required" 
        });
        return;
      }

      // Get payment from database
      const payment = await storage.getPaymentByStripeSessionId(sessionId);
      if (!payment) {
        res.status(404).json({ 
          success: false, 
          error: "Payment session not found" 
        });
        return;
      }

      // Get associated lead
      const lead = await storage.getLead(payment.leadId);
      if (!lead) {
        res.status(404).json({ 
          success: false, 
          error: "Associated lead not found" 
        });
        return;
      }

      // Retrieve session from Stripe for verification
      let stripeSession;
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (error) {
        logger.error('Failed to retrieve Stripe session', error as Error, { sessionId });
        res.status(400).json({ 
          success: false, 
          error: "Invalid session ID" 
        });
        return;
      }

      // Check if payment was successful
      const isSuccessful = stripeSession.payment_status === 'paid' && payment.status === 'paid';
      
      logger.info('Payment confirmation check', { 
        sessionId,
        paymentId: payment.id,
        leadId: lead.id,
        stripeStatus: stripeSession.payment_status,
        dbStatus: payment.status,
        isSuccessful
      });

      res.json({
        success: true,
        isSuccessful,
        payment: {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          createdAt: payment.createdAt
        },
        lead: {
          id: lead.id,
          status: lead.status,
          businessName: lead.businessName
        },
        session: {
          id: stripeSession.id,
          status: stripeSession.status,
          payment_status: stripeSession.payment_status
        }
      });
    } catch (error) {
      logger.error('Payment confirmation failed', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to confirm payment" 
      });
    }
  });

  // Stripe webhook endpoint
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    try {
      if (!paymentsEnabled || !stripe) {
        logger.warn('Stripe webhook received but payments are disabled');
        res.status(400).json({ 
          success: false, 
          error: "Payments are not enabled" 
        });
        return;
      }

      if (!STRIPE_WEBHOOK_SECRET) {
        logger.error('Stripe webhook secret not configured');
        res.status(500).json({ 
          success: false, 
          error: "Webhook secret not configured" 
        });
        return;
      }

      const sig = req.headers['stripe-signature'] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        logger.error('Stripe webhook signature verification failed', err as Error);
        res.status(400).json({ 
          success: false, 
          error: "Webhook signature verification failed" 
        });
        return;
      }

      logger.info('Stripe webhook received', { 
        eventType: event.type,
        eventId: event.id 
      });

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const leadId = session.metadata?.leadId;
          const scanId = session.metadata?.scanId;
          
          if (!leadId) {
            logger.warn('Checkout session completed without leadId', { 
              sessionId: session.id, 
              eventId: event.id 
            });
            break;
          }

          // Check if this event has already been processed (idempotency)
          const existingEvents = await storage.getLeadEvents(leadId);
          const alreadyProcessed = existingEvents.some(e => 
            e.eventType === 'payment_completed' && 
            e.details && 
            typeof e.details === 'object' &&
            'stripeEventId' in e.details &&
            e.details.stripeEventId === event.id
          );
          
          if (alreadyProcessed) {
            logger.info('Webhook event already processed', { 
              eventId: event.id, 
              sessionId: session.id, 
              leadId 
            });
            break;
          }

          logger.info('Processing checkout session completion', { 
            sessionId: session.id, 
            leadId,
            scanId,
            paymentStatus: session.payment_status,
            eventId: event.id
          });

          // Update payment status
          const payment = await storage.getPaymentByStripeSessionId(session.id);
          if (payment) {
            await storage.updatePayment(payment.id, {
              status: session.payment_status === 'paid' ? 'paid' : 'failed',
              stripePaymentIntentId: session.payment_intent as string,
            });

            // Update lead status to converted if payment succeeded
            if (session.payment_status === 'paid') {
              await storage.updateLead(leadId, {
                status: 'converted'
              });

              // Log conversion event with event ID for idempotency
              await storage.createLeadEvent({
                leadId: leadId,
                eventType: "payment_completed",
                details: {
                  paymentId: payment.id,
                  sessionId: session.id,
                  scanId: scanId || null,
                  amount: payment.amount,
                  stripeEventId: event.id, // Store event ID for idempotency
                  convertedAt: new Date().toISOString()
                }
              });

              logger.info('Lead converted after successful payment', { 
                leadId, 
                paymentId: payment.id,
                sessionId: session.id,
                scanId,
                eventId: event.id
              });
            } else {
              // Log failed payment event
              await storage.createLeadEvent({
                leadId: leadId,
                eventType: "payment_failed",
                details: {
                  paymentId: payment.id,
                  sessionId: session.id,
                  scanId: scanId || null,
                  stripeEventId: event.id,
                  failedAt: new Date().toISOString()
                }
              });
            }
          }
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          
          logger.info('Payment intent succeeded', { 
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount
          });

          // Update payment status if we find it by payment intent ID
          const payment = await storage.getPaymentByStripePaymentIntentId(paymentIntent.id);
          if (payment) {
            await storage.updatePayment(payment.id, {
              status: 'paid'
            });
          }
          break;
        }

        default:
          logger.info('Unhandled Stripe webhook event type', { 
            eventType: event.type 
          });
      }

      res.json({ success: true, received: true });
    } catch (error) {
      logger.error('Stripe webhook processing failed', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Webhook processing failed" 
      });
    }
  });

  // Chat API endpoints
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, context, conversationId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: "Message is required and must be a string"
        });
        return;
      }

      if (message.length > 2000) {
        res.status(400).json({
          success: false,
          error: "Message too long (max 2000 characters)"
        });
        return;
      }

      // Generate conversation ID if not provided
      const finalConversationId = conversationId || crypto.randomUUID();

      logger.info('Chat message received', { 
        messageLength: message.length,
        hasContext: !!context,
        conversationId: finalConversationId
      });

      // Save user message to database
      try {
        await storage.createChatMessage({
          conversationId: finalConversationId,
          scanId: context?.scanId || null,
          leadId: context?.leadId || null,
          role: "user",
          content: message,
          metadata: { context }
        });
      } catch (dbError) {
        logger.warn('Failed to save user message to database', dbError as Error);
      }

      const chatResponse = await processChatMessage({ message, context });

      // Save assistant response to database
      if (chatResponse.success && chatResponse.response) {
        try {
          await storage.createChatMessage({
            conversationId: finalConversationId,
            scanId: context?.scanId || null,
            leadId: context?.leadId || null,
            role: "assistant",
            content: chatResponse.response,
            metadata: { context }
          });
        } catch (dbError) {
          logger.warn('Failed to save assistant response to database', dbError as Error);
        }
      }

      res.json({
        success: chatResponse.success,
        response: chatResponse.response,
        conversationId: finalConversationId,
        ...(chatResponse.error && { error: chatResponse.error })
      });

    } catch (error) {
      logger.error('Chat API error', error as Error);
      res.status(500).json({
        success: false,
        error: "Internal server error"
      });
    }
  });

  app.get("/api/chat/status", async (req: Request, res: Response) => {
    try {
      const enabled = isChatEnabled();
      
      res.json({
        success: true,
        chatEnabled: enabled,
        provider: enabled ? "openai" : null
      });
    } catch (error) {
      logger.error('Chat status check failed', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to check chat status"
      });
    }
  });

  app.get("/api/chat/history/:conversationId", async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params;

      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: "Conversation ID is required"
        });
        return;
      }

      logger.info('Chat history requested', { conversationId });

      const messages = await storage.getChatMessagesByConversation(conversationId);

      res.json({
        success: true,
        messages,
        conversationId
      });

    } catch (error) {
      logger.error('Chat history retrieval failed', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve chat history"
      });
    }
  });

  // =================== WORKFLOW API ENDPOINTS ===================
  
  // **Admin API Endpoints:**

  // 1. GET /api/workflows - List all workflows with pagination
  app.get("/api/workflows", requireAuth, rateLimit(50, 60000), async (req: Request, res: Response) => {
    try {
      const queryParams = paginationSchema.safeParse(req.query);
      if (!queryParams.success) {
        res.status(400).json({
          success: false,
          error: "Invalid pagination parameters",
          details: queryParams.error.errors
        });
        return;
      }

      const { page, limit } = queryParams.data;
      
      logger.info('Workflows list requested', { page, limit });

      // Get all workflows (storage interface doesn't have pagination built-in yet)
      const allWorkflows = await storage.getAllWorkflows?.() || [];
      
      // Implement pagination manually
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const workflows = allWorkflows.slice(startIndex, endIndex);
      
      // Add version info to each workflow
      const workflowsWithVersions = await Promise.all(workflows.map(async (workflow) => {
        const versions = await storage.getWorkflowVersionsByWorkflowId(workflow.id);
        return {
          ...workflow,
          versionCount: versions.length,
          publishedVersions: versions.filter(v => v.status === 'published').length
        };
      }));

      res.json({
        success: true,
        data: workflowsWithVersions,
        pagination: {
          page,
          limit,
          total: allWorkflows.length,
          totalPages: Math.ceil(allWorkflows.length / limit)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch workflows', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch workflows"
      });
    }
  });

  // 2. POST /api/workflows - Create new workflow
  app.post("/api/workflows", requireAuth, rateLimit(20, 60000), async (req: Request, res: Response) => {
    try {
      const validatedData = insertWorkflowSchema.parse(req.body);
      
      logger.info('Creating new workflow', { 
        name: validatedData.name,
        businessType: validatedData.businessType 
      });

      // Check if workflow with same name exists
      const existingWorkflow = await storage.getWorkflowByName(validatedData.name);
      if (existingWorkflow) {
        res.status(409).json({
          success: false,
          error: "Workflow with this name already exists"
        });
        return;
      }

      const workflow = await storage.createWorkflow(validatedData);

      logger.info('Workflow created successfully', { 
        workflowId: workflow.id,
        name: workflow.name 
      });

      res.status(201).json({
        success: true,
        data: workflow
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Workflow creation validation failed', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.errors
        });
      } else {
        logger.error('Workflow creation failed', error as Error);
        res.status(500).json({
          success: false,
          error: "Failed to create workflow"
        });
      }
    }
  });

  // 3. GET /api/workflows/:id - Get specific workflow with versions
  app.get("/api/workflows/:id", requireAuth, rateLimit(100, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      logger.info('Workflow details requested', { workflowId: id });

      const workflow = await storage.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: "Workflow not found"
        });
        return;
      }

      // Get all versions for this workflow
      const versions = await storage.getWorkflowVersionsByWorkflowId(id);

      res.json({
        success: true,
        data: {
          ...workflow,
          versions: versions.sort((a, b) => b.version - a.version) // Latest first
        }
      });

    } catch (error) {
      logger.error('Failed to fetch workflow details', error as Error, { workflowId: req.params.id });
      res.status(500).json({
        success: false,
        error: "Failed to fetch workflow details"
      });
    }
  });

  // 4. PATCH /api/workflows/:id - Update workflow (name, businessType, etc.)
  app.patch("/api/workflows/:id", requireAuth, rateLimit(30, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = updateWorkflowSchema.parse(req.body);
      
      logger.info('Updating workflow', { workflowId: id, updates: Object.keys(validatedData) });

      const existingWorkflow = await storage.getWorkflow(id);
      if (!existingWorkflow) {
        res.status(404).json({
          success: false,
          error: "Workflow not found"
        });
        return;
      }

      // Check if name is being changed to an existing name
      if (validatedData.name && validatedData.name !== existingWorkflow.name) {
        const nameExists = await storage.getWorkflowByName(validatedData.name);
        if (nameExists) {
          res.status(409).json({
            success: false,
            error: "Workflow with this name already exists"
          });
          return;
        }
      }

      const updatedWorkflow = await storage.updateWorkflow(id, validatedData);

      logger.info('Workflow updated successfully', { workflowId: id });

      res.json({
        success: true,
        data: updatedWorkflow
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Workflow update validation failed', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.errors
        });
      } else {
        logger.error('Workflow update failed', error as Error, { workflowId: req.params.id });
        res.status(500).json({
          success: false,
          error: "Failed to update workflow"
        });
      }
    }
  });

  // 5. POST /api/workflows/:id/versions - Create new draft version
  app.post("/api/workflows/:id/versions", requireAuth, rateLimit(20, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = insertWorkflowVersionSchema.omit({ workflowId: true }).parse(req.body);
      
      logger.info('Creating new workflow version', { workflowId: id });

      const workflow = await storage.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: "Workflow not found"
        });
        return;
      }

      // Get existing versions to determine next version number
      const existingVersions = await storage.getWorkflowVersionsByWorkflowId(id);
      const nextVersion = existingVersions.length > 0 ? 
        Math.max(...existingVersions.map(v => v.version)) + 1 : 1;

      const newVersion = await storage.createWorkflowVersion({
        workflowId: id,
        version: validatedData.version || nextVersion,
        status: "draft",
        definition: validatedData.definition
      });

      logger.info('Workflow version created successfully', { 
        workflowId: id,
        versionId: newVersion.id,
        version: newVersion.version
      });

      res.status(201).json({
        success: true,
        data: newVersion
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Workflow version creation validation failed', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.errors
        });
      } else {
        logger.error('Workflow version creation failed', error as Error, { workflowId: req.params.id });
        res.status(500).json({
          success: false,
          error: "Failed to create workflow version"
        });
      }
    }
  });

  // 6. PATCH /api/workflow-versions/:id - Update workflow version definition
  app.patch("/api/workflow-versions/:id", requireAuth, rateLimit(30, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = updateWorkflowVersionSchema.parse(req.body);
      
      logger.info('Updating workflow version', { versionId: id, updates: Object.keys(validatedData) });

      const existingVersion = await storage.getWorkflowVersion(id);
      if (!existingVersion) {
        res.status(404).json({
          success: false,
          error: "Workflow version not found"
        });
        return;
      }

      // Prevent editing published versions unless explicitly changing status
      if (existingVersion.status === 'published' && validatedData.definition && !validatedData.status) {
        res.status(400).json({
          success: false,
          error: "Cannot modify definition of published version. Create a new version instead."
        });
        return;
      }

      const updatedVersion = await storage.updateWorkflowVersion(id, validatedData);

      logger.info('Workflow version updated successfully', { versionId: id });

      res.json({
        success: true,
        data: updatedVersion
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Workflow version update validation failed', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.errors
        });
      } else {
        logger.error('Workflow version update failed', error as Error, { versionId: req.params.id });
        res.status(500).json({
          success: false,
          error: "Failed to update workflow version"
        });
      }
    }
  });

  // 7. POST /api/workflow-versions/:id/publish - Publish a draft version
  app.post("/api/workflow-versions/:id/publish", requireAuth, rateLimit(20, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      logger.info('Publishing workflow version', { versionId: id });

      const version = await storage.getWorkflowVersion(id);
      if (!version) {
        res.status(404).json({
          success: false,
          error: "Workflow version not found"
        });
        return;
      }

      if (version.status === 'published') {
        res.status(400).json({
          success: false,
          error: "Version is already published"
        });
        return;
      }

      // Update version status to published
      const publishedVersion = await storage.updateWorkflowVersion(id, { status: 'published' });
      
      // Update the workflow's active version
      await storage.updateWorkflow(version.workflowId, { activeVersionId: id });

      logger.info('Workflow version published successfully', { 
        versionId: id,
        workflowId: version.workflowId 
      });

      res.json({
        success: true,
        data: publishedVersion,
        message: "Workflow version published successfully"
      });

    } catch (error) {
      logger.error('Workflow version publish failed', error as Error, { versionId: req.params.id });
      res.status(500).json({
        success: false,
        error: "Failed to publish workflow version"
      });
    }
  });

  // 8. POST /api/workflows/:id/make-default - Make workflow default for businessType
  app.post("/api/workflows/:id/make-default", requireAuth, rateLimit(20, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      logger.info('Making workflow default', { workflowId: id });

      const workflow = await storage.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: "Workflow not found"
        });
        return;
      }

      if (!workflow.businessType) {
        res.status(400).json({
          success: false,
          error: "Workflow must have a businessType to be made default"
        });
        return;
      }

      // Check if workflow has a published version
      const versions = await storage.getWorkflowVersionsByWorkflowId(id);
      const hasPublishedVersion = versions.some(v => v.status === 'published');
      
      if (!hasPublishedVersion) {
        res.status(400).json({
          success: false,
          error: "Workflow must have at least one published version to be made default"
        });
        return;
      }

      // Remove default flag from other workflows with same business type
      // Note: This would require a more sophisticated storage method in a real implementation
      // For now, we'll just update this workflow to be default
      
      const updatedWorkflow = await storage.updateWorkflow(id, { isDefault: true });

      logger.info('Workflow made default successfully', { 
        workflowId: id,
        businessType: workflow.businessType
      });

      res.json({
        success: true,
        data: updatedWorkflow,
        message: `Workflow is now default for ${workflow.businessType}`
      });

    } catch (error) {
      logger.error('Make workflow default failed', error as Error, { workflowId: req.params.id });
      res.status(500).json({
        success: false,
        error: "Failed to make workflow default"
      });
    }
  });

  // **Workflow Runs API:**

  // 9. GET /api/workflow-runs - List workflow runs with optional scanId filter
  app.get("/api/workflow-runs", requireAuth, rateLimit(100, 60000), async (req: Request, res: Response) => {
    try {
      const queryValidation = z.object({
        scanId: z.string().optional(),
        status: z.enum(["queued", "running", "succeeded", "failed"]).optional(),
        ...paginationSchema.shape
      }).safeParse(req.query);

      if (!queryValidation.success) {
        res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: queryValidation.error.errors
        });
        return;
      }

      const { scanId, status, page, limit } = queryValidation.data;
      
      logger.info('Workflow runs list requested', { scanId, status, page, limit });

      // Get workflow runs with optional status filter
      let workflowRuns;
      if (status) {
        workflowRuns = await storage.getWorkflowRunsByStatus(status);
      } else {
        // For now, get all runs since storage doesn't have getAllWorkflowRuns
        workflowRuns = await storage.getWorkflowRunsByStatus("queued");
        const runningRuns = await storage.getWorkflowRunsByStatus("running");
        const succeededRuns = await storage.getWorkflowRunsByStatus("succeeded");
        const failedRuns = await storage.getWorkflowRunsByStatus("failed");
        workflowRuns = [...workflowRuns, ...runningRuns, ...succeededRuns, ...failedRuns];
      }

      // Filter by scanId if provided
      if (scanId) {
        workflowRuns = workflowRuns.filter(run => run.scanId === scanId);
      }

      // Sort by created date (newest first)
      workflowRuns.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      // Implement pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedRuns = workflowRuns.slice(startIndex, endIndex);

      // Enhance with workflow version info
      const enhancedRuns = await Promise.all(paginatedRuns.map(async (run) => {
        const version = await storage.getWorkflowVersion(run.workflowVersionId);
        const workflow = version ? await storage.getWorkflow(version.workflowId) : null;
        
        return {
          ...run,
          workflowName: workflow?.name,
          workflowVersion: version?.version
        };
      }));

      res.json({
        success: true,
        data: enhancedRuns,
        pagination: {
          page,
          limit,
          total: workflowRuns.length,
          totalPages: Math.ceil(workflowRuns.length / limit)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch workflow runs', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch workflow runs"
      });
    }
  });

  // 10. GET /api/workflow-runs/:id - Get specific workflow run with steps
  app.get("/api/workflow-runs/:id", requireAuth, rateLimit(100, 60000), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      logger.info('Workflow run details requested', { runId: id });

      const workflowRun = await storage.getWorkflowRun(id);
      if (!workflowRun) {
        res.status(404).json({
          success: false,
          error: "Workflow run not found"
        });
        return;
      }

      // Get workflow run steps
      const steps = await storage.getWorkflowRunSteps(id);
      
      // Get workflow version and workflow info
      const version = await storage.getWorkflowVersion(workflowRun.workflowVersionId);
      const workflow = version ? await storage.getWorkflow(version.workflowId) : null;

      // Get scan result if linked
      const scanResult = workflowRun.scanId ? await storage.getScanResult(workflowRun.scanId) : null;

      // Get lead if linked
      const lead = workflowRun.leadId ? await storage.getLead(workflowRun.leadId) : null;

      res.json({
        success: true,
        data: {
          ...workflowRun,
          steps: steps.sort((a, b) => new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime()),
          workflowName: workflow?.name,
          workflowVersion: version?.version,
          workflowDefinition: version?.definition,
          scanResult,
          lead
        }
      });

    } catch (error) {
      logger.error('Failed to fetch workflow run details', error as Error, { runId: req.params.id });
      res.status(500).json({
        success: false,
        error: "Failed to fetch workflow run details"
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
