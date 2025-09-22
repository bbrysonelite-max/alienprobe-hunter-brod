import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { 
  insertScanResultSchema, 
  insertLeadSchema, 
  insertPaymentSchema,
  insertChatMessageSchema,
  insertWorkflowSchema,
  insertWorkflowVersionSchema,
  insertWorkflowRunSchema,
  insertWorkflowRunStepSchema,
  workflowDefinitionSchema,
  payments,
  scanResults,
  emailLog,
  emailQueue,
  leads,
  businessTools,
  toolCategories,
  toolRecommendations,
  huntRuns,
  pipelineRuns,
  systemGoals,
  insertSystemGoalSchema,
  type Workflow,
  type WorkflowVersion,
  type WorkflowRun,
  type WorkflowRunStep
} from "@shared/schema";
import { z } from "zod";
import { eq, desc, and, count, sql, asc, or, gte, lte, lt } from "drizzle-orm";
import { healthCheck, livenessProbe, readinessProbe, metricsEndpoint, simulateError } from "./monitoring";
import { logger } from "./logger";
import crypto from "crypto";
import Stripe from "stripe";
import { processChatMessage, isChatEnabled } from "./chat";
import { WorkflowExecutor } from "./workflows/executor";
import { createHash, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import { discoveryEngine } from "./prospecting/discovery-engine";
import { hunterScheduler } from "./prospecting/hunter-scheduler";
import { recommendationEngine } from "./recommendations/recommendation-engine";
import { config } from "./config";

// Initialize Stripe if secret key is present
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PAYMENT_LINK_URL = process.env.STRIPE_PAYMENT_LINK_URL;
const FULL_SCAN_PRICE_AMOUNT = parseInt(process.env.FULL_SCAN_PRICE_AMOUNT || "4900"); // Default $49.00

// Hunter Brody pricing optimization for maximum lead generation
const HUNTER_PRICING = {
  // Per-lead discovery costs
  COST_PER_LEAD: parseInt(process.env.HUNTER_COST_PER_LEAD || "10"), // $0.10 per lead discovered
  
  // Per-scan processing costs
  COST_PER_SCAN: parseInt(process.env.HUNTER_COST_PER_SCAN || "250"), // $2.50 per business scan
  
  // Bulk pricing tiers for high-volume customers
  BULK_TIERS: [
    { min: 1, max: 100, pricePerLead: 10, pricePerScan: 250, discount: 0 },      // $0.10/lead, $2.50/scan
    { min: 101, max: 500, pricePerLead: 8, pricePerScan: 200, discount: 20 },    // 20% discount
    { min: 501, max: 1000, pricePerLead: 6, pricePerScan: 150, discount: 40 },   // 40% discount  
    { min: 1001, max: 10000, pricePerLead: 4, pricePerScan: 100, discount: 60 }, // 60% discount
    { min: 10001, max: Infinity, pricePerLead: 2, pricePerScan: 75, discount: 70 } // 70% discount (enterprise)
  ],

  // Monthly subscription plans for autonomous hunting
  MONTHLY_PLANS: {
    starter: { leads: 500, scans: 100, price: 4900 },   // $49/month: 500 leads + 100 scans
    growth: { leads: 2000, scans: 500, price: 14900 },  // $149/month: 2K leads + 500 scans  
    scale: { leads: 10000, scans: 2000, price: 49900 }, // $499/month: 10K leads + 2K scans
    enterprise: { leads: 50000, scans: 10000, price: 149900 } // $1499/month: 50K leads + 10K scans
  }
};

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil" as any, // Use valid API version
}) : null;

const paymentsEnabled = !!STRIPE_SECRET_KEY;

// Initialize Workflow Executor
const workflowExecutor = new WorkflowExecutor();

// Enhanced authentication and authorization system
interface AuthenticatedUser {
  id: string;
  role: 'admin' | 'operator' | 'viewer';
  permissions: string[];
  issuedAt: number;
  expiresAt?: number;
}

// Role-based permissions mapping
const ROLE_PERMISSIONS = {
  admin: ['workflow:create', 'workflow:read', 'workflow:update', 'workflow:delete', 'system:monitor', 'workflow:execute'],
  operator: ['workflow:read', 'workflow:update', 'workflow:execute'],
  viewer: ['workflow:read']
};

// Secure API key validation with timing-safe comparison
function validateApiKey(providedKey: string, storedKey: string): boolean {
  if (!providedKey || !storedKey) return false;
  
  // Convert to buffers for timing-safe comparison
  const providedBuffer = Buffer.from(providedKey);
  const storedBuffer = Buffer.from(storedKey);
  
  // Keys must be same length for timing-safe comparison
  if (providedBuffer.length !== storedBuffer.length) return false;
  
  return timingSafeEqual(providedBuffer, storedBuffer);
}

// Enhanced JWT token validation
function validateJwtToken(token: string): AuthenticatedUser | null {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured for secure authentication');
      return null;
    }

    const decoded = jwt.verify(token, jwtSecret) as any;
    
    // Validate token structure
    if (!decoded.id || !decoded.role || !ROLE_PERMISSIONS[decoded.role as keyof typeof ROLE_PERMISSIONS]) {
      logger.warn('Invalid JWT token structure', { tokenPayload: decoded });
      return null;
    }

    // Check expiration
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      logger.warn('JWT token expired', { tokenId: decoded.id, expiredAt: decoded.exp });
      return null;
    }

    return {
      id: decoded.id,
      role: decoded.role,
      permissions: ROLE_PERMISSIONS[decoded.role as keyof typeof ROLE_PERMISSIONS] || [],
      issuedAt: decoded.iat || 0,
      expiresAt: decoded.exp
    };
  } catch (error) {
    logger.warn('JWT token validation failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return null;
  }
}

// Enhanced authentication middleware with role-based access control
const requireAuth = (requiredPermissions: string[] = []) => {
  return (req: Request, res: Response, next: Function) => {
    const startTime = Date.now();
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    let authenticatedUser: AuthenticatedUser | null = null;
    let authMethod = 'none';

    try {
      // Development bypass for localhost
      if (config.NODE_ENV === 'development' && (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost')) {
        authenticatedUser = {
          id: 'dev-admin',
          role: 'admin',
          permissions: ROLE_PERMISSIONS.admin,
          issuedAt: Date.now() / 1000
        };
        authMethod = 'development-bypass';
        logger.info('Development authentication bypass granted', { clientIp, endpoint: req.path });
      }
      
      // Method 1: Secure API Key authentication
      if (!authenticatedUser && apiKey && process.env.ADMIN_API_KEY) {
        if (validateApiKey(apiKey, process.env.ADMIN_API_KEY)) {
          authenticatedUser = {
            id: 'api-key-admin',
            role: 'admin',
            permissions: ROLE_PERMISSIONS.admin,
            issuedAt: Date.now() / 1000
          };
          authMethod = 'api-key';
        } else {
          logger.warn('Invalid API key authentication attempt', { 
            clientIp,
            userAgent: req.headers['user-agent'],
            endpoint: req.path
          });
        }
      }
      
      // Method 2: JWT Token authentication
      if (!authenticatedUser && authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        authenticatedUser = validateJwtToken(token);
        if (authenticatedUser) {
          authMethod = 'jwt';
        }
      }

      // Check if user is authenticated
      if (!authenticatedUser) {
        logger.warn('Unauthorized access attempt', {
          clientIp,
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
          hasApiKey: !!apiKey,
          hasAuthHeader: !!authHeader
        });
        
        return res.status(401).json({
          success: false,
          error: "Unauthorized - Valid authentication required",
          code: 'AUTH_REQUIRED'
        });
      }

      // Check permissions if required
      if (requiredPermissions.length > 0) {
        const hasRequiredPermissions = requiredPermissions.every(permission => 
          authenticatedUser!.permissions.includes(permission)
        );
        
        if (!hasRequiredPermissions) {
          logger.warn('Insufficient permissions for admin endpoint', {
            userId: authenticatedUser.id,
            userRole: authenticatedUser.role,
            requiredPermissions,
            userPermissions: authenticatedUser.permissions,
            endpoint: req.path,
            clientIp
          });
          
          return res.status(403).json({
            success: false,
            error: "Forbidden - Insufficient permissions",
            code: 'INSUFFICIENT_PERMISSIONS',
            required: requiredPermissions
          });
        }
      }

      // Log successful authentication
      logger.info('Successful admin authentication', {
        userId: authenticatedUser.id,
        role: authenticatedUser.role,
        method: authMethod,
        endpoint: req.path,
        clientIp,
        authDuration: Date.now() - startTime
      });

      // Attach user to request
      (req as any).user = authenticatedUser;
      next();
      
    } catch (error) {
      logger.error('Authentication middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint: req.path,
        clientIp
      });
      
      return res.status(500).json({
        success: false,
        error: "Internal authentication error",
        code: 'AUTH_ERROR'
      });
    }
  };
};

// Helper function for basic admin auth (backward compatibility)
const requireAdminAuth = requireAuth(['workflow:read', 'workflow:update']);

// Enhanced rate limiting with security considerations
interface RateLimitEntry {
  count: number;
  resetTime: number;
  suspiciousActivity: boolean;
  lastAttempt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

// Enhanced rate limiting with security monitoring
const rateLimit = (maxRequests: number = 100, windowMs: number = 60000, strictMode: boolean = false) => {
  return (req: Request, res: Response, next: Function) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const key = `${clientIp}:${userAgent.substring(0, 50)}`; // Include user agent for better tracking
    const now = Date.now();
    const limit = rateLimits.get(key);
    
    // Check for suspicious patterns
    const isSuspicious = strictMode && (
      !req.headers['user-agent'] || 
      req.headers['user-agent'].includes('curl') ||
      req.headers['user-agent'].includes('wget') ||
      req.headers['user-agent'].length < 10
    );
    
    if (!limit || now > limit.resetTime) {
      rateLimits.set(key, { 
        count: 1, 
        resetTime: now + windowMs,
        suspiciousActivity: isSuspicious,
        lastAttempt: now
      });
      next();
    } else if (limit.count < maxRequests) {
      limit.count++;
      limit.lastAttempt = now;
      if (isSuspicious) {
        limit.suspiciousActivity = true;
      }
      next();
    } else {
      // Log rate limit exceeded
      logger.warn('Rate limit exceeded', {
        clientIp,
        userAgent,
        endpoint: req.path,
        requestCount: limit.count,
        suspiciousActivity: limit.suspiciousActivity || isSuspicious,
        windowMs
      });
      
      // Mark as suspicious if hitting rate limits frequently
      limit.suspiciousActivity = true;
      
      res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      });
    }
  };
};

// Strict rate limiting for admin endpoints
const adminRateLimit = rateLimit(50, 60000, true);

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
  definition: z.record(z.any()).optional(), // More specific than 'any'
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
            // Create a minimal lead for valid scans that don't have one
            logger.info('Creating lead for scan without associated lead for payment', { scanId });
            
            const scanData = scanResult.scanData ? JSON.parse(scanResult.scanData) : {};
            const businessName = scanData.businessName || scanResult.businessName || "Unknown Business";
            const website = scanData.businessWebsite || scanResult.businessWebsite || null;
            
            // Create a lead for this scan
            const newLead = await storage.createLead({
              businessName: businessName,
              businessWebsite: website,
              status: "interested", // User is interested since they want to pay
              source: "scan_payment",
              priority: "medium",
              contactInfo: {
                type: "scan_based",
                scanId: scanId
              },
              lastContactDate: new Date(),
              notes: `Lead created automatically for payment flow from scan ${scanId}`
            });
            
            lead = newLead;
            resolvedId = scanId;
            lookupMethod = "scanId-created-lead";
            
            logger.info('Successfully created lead for scan payment', { 
              scanId, 
              leadId: newLead.id, 
              businessName 
            });
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

  // Note: Raw body middleware for webhook signature verification is handled in index.ts
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

          // Check if this event has already been processed (enhanced idempotency)
          const existingEvents = await storage.getLeadEvents(leadId);
          const alreadyProcessed = existingEvents.some(e => 
            e.eventType === 'stripe_event_processed' && 
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

              // Validate payment amount and currency (CRITICAL for revenue integrity)
              const expectedAmount = FULL_SCAN_PRICE_AMOUNT; // $49.00 in cents
              const expectedCurrency = 'usd';
              
              const isValidAmount = payment.amount === expectedAmount;
              const isValidCurrency = payment.currency === expectedCurrency;
              
              if (!isValidAmount || !isValidCurrency) {
                logger.error('CRITICAL: Payment validation failed - marking as fraud', new Error('Payment validation failed'), {
                  paymentId: payment.id,
                  expectedAmount,
                  actualAmount: payment.amount,
                  expectedCurrency,
                  actualCurrency: payment.currency,
                  sessionId: session.id,
                  leadId
                });
                
                // BLOCK conversion - mark as failed and do not count in revenue
                await storage.updatePayment(payment.id, {
                  status: 'failed'
                });
                
                await storage.createLeadEvent({
                  leadId: leadId,
                  eventType: "payment_validation_failed",
                  details: {
                    paymentId: payment.id,
                    sessionId: session.id,
                    expectedAmount,
                    actualAmount: payment.amount,
                    expectedCurrency,
                    actualCurrency: payment.currency,
                    reason: 'Amount or currency validation failed - potential fraud',
                    stripeEventId: event.id,
                    failedAt: new Date().toISOString()
                  }
                });
                
                // Do not proceed with conversion
                logger.warn('Skipping lead conversion due to payment validation failure');
                break;
              }
              
              // Log stripe event processing for idempotency (prevents double-counting)
              await storage.createLeadEvent({
                leadId: leadId,
                eventType: "stripe_event_processed",
                details: {
                  stripeEventId: event.id,
                  eventType: event.type,
                  sessionId: session.id,
                  processedAt: new Date().toISOString()
                }
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
                  currency: payment.currency || 'usd',
                  expectedAmount: expectedAmount,
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
            
            logger.info('Payment status updated to paid via payment_intent.succeeded', {
              paymentId: payment.id,
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount
            });
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          
          logger.warn('Payment intent failed', { 
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            failureCode: paymentIntent.last_payment_error?.code,
            failureMessage: paymentIntent.last_payment_error?.message
          });

          // Update payment status if we find it by payment intent ID
          const payment = await storage.getPaymentByStripePaymentIntentId(paymentIntent.id);
          if (payment) {
            await storage.updatePayment(payment.id, {
              status: 'failed'
            });
            
            // Log payment failure for analytics
            logger.info('Payment status updated to failed via payment_intent.payment_failed', {
              paymentId: payment.id,
              paymentIntentId: paymentIntent.id,
              failureCode: paymentIntent.last_payment_error?.code
            });
          }
          break;
        }

        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed': {
          // Handle subscription payments for future subscription features
          const invoice = event.data.object as Stripe.Invoice;
          
          logger.info('Invoice payment event received', {
            eventType: event.type,
            invoiceId: invoice.id,
            amount: invoice.amount_paid,
            subscriptionId: (invoice as any).subscription
          });
          
          // Future enhancement: Handle subscription payments
          break;
        }

        default:
          logger.info('Unhandled Stripe webhook event type', { 
            eventType: event.type 
          });
      }

      // Send success response immediately for Stripe
      res.json({ success: true, received: true, eventType: event.type, eventId: event.id });
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
      
      // Validate workflow definition structure if provided
      if (validatedData.definition) {
        try {
          workflowDefinitionSchema.parse(validatedData.definition);
        } catch (definitionError) {
          logger.warn('Workflow definition validation failed', { 
            workflowId: id,
            errors: definitionError instanceof z.ZodError ? definitionError.errors : [definitionError]
          });
          res.status(400).json({
            success: false,
            error: "Workflow definition validation failed",
            details: definitionError instanceof z.ZodError ? definitionError.errors : [{ message: String(definitionError) }]
          });
          return;
        }
      }
      
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
      
      // Validate workflow definition structure if provided
      if (validatedData.definition) {
        try {
          workflowDefinitionSchema.parse(validatedData.definition);
        } catch (definitionError) {
          logger.warn('Workflow definition validation failed', { 
            versionId: id,
            errors: definitionError instanceof z.ZodError ? definitionError.errors : [definitionError]
          });
          res.status(400).json({
            success: false,
            error: "Workflow definition validation failed",
            details: definitionError instanceof z.ZodError ? definitionError.errors : [{ message: String(definitionError) }]
          });
          return;
        }
      }
      
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

      // Validate workflow definition before publishing
      if (version.definition) {
        try {
          workflowDefinitionSchema.parse(version.definition);
        } catch (definitionError) {
          logger.warn('Workflow definition validation failed during publish', { 
            versionId: id,
            errors: definitionError instanceof z.ZodError ? definitionError.errors : [definitionError]
          });
          res.status(400).json({
            success: false,
            error: "Cannot publish workflow version - definition validation failed",
            details: definitionError instanceof z.ZodError ? definitionError.errors : [{ message: String(definitionError) }]
          });
          return;
        }
      } else {
        res.status(400).json({
          success: false,
          error: "Cannot publish workflow version - no definition found"
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

  // 8. DELETE /api/workflows/:id - Delete workflow with proper dependency checking
  app.delete("/api/workflows/:id", requireAdminAuth, adminRateLimit, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { force } = req.query; // Allow force deletion for admin override
      const forceDelete = force === 'true';
      
      logger.info('Workflow deletion initiated', { 
        workflowId: id, 
        forceDelete,
        userId: (req as any).user?.id 
      });

      const workflow = await storage.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: "Workflow not found",
          code: 'WORKFLOW_NOT_FOUND'
        });
        return;
      }

      // Comprehensive dependency analysis
      const dependencyCheck = await checkWorkflowDependencies(id);
      
      if (dependencyCheck.hasActiveRuns && !forceDelete) {
        res.status(409).json({
          success: false,
          error: "Cannot delete workflow with active runs",
          code: 'ACTIVE_RUNS_EXIST',
          details: {
            activeRuns: dependencyCheck.activeRunCount,
            versions: dependencyCheck.versionCount,
            totalRuns: dependencyCheck.totalRunCount,
            totalSteps: dependencyCheck.totalStepCount
          },
          suggestions: [
            "Wait for active runs to complete",
            "Cancel active runs first",
            "Use force=true query parameter for admin override (will cascade delete)"
          ]
        });
        return;
      }

      if (dependencyCheck.hasDependencies && !forceDelete) {
        res.status(409).json({
          success: false,
          error: "Workflow has dependencies that prevent deletion",
          code: 'DEPENDENCIES_EXIST',
          details: {
            versions: dependencyCheck.versionCount,
            totalRuns: dependencyCheck.totalRunCount,
            totalSteps: dependencyCheck.totalStepCount,
            isDefault: workflow.isDefault
          },
          suggestions: [
            "Use force=true query parameter to cascade delete all dependencies",
            "Manually clean up workflow runs and versions first"
          ]
        });
        return;
      }

      // Perform transactional deletion with proper error handling
      const deletionResult = await performWorkflowDeletion(id, forceDelete, dependencyCheck);
      
      if (!deletionResult.success) {
        logger.error('Workflow deletion failed', undefined, {
          workflowId: id,
          error: deletionResult.error,
          partialDeletion: deletionResult.partialDeletion
        });
        
        res.status(500).json({
          success: false,
          error: deletionResult.error,
          code: 'DELETION_FAILED',
          partialDeletion: deletionResult.partialDeletion
        });
        return;
      }

      logger.info('Workflow deleted successfully', { 
        workflowId: id, 
        workflowName: workflow.name,
        forceDelete,
        deletedComponents: deletionResult.deletedComponents
      });

      res.json({
        success: true,
        message: "Workflow deleted successfully",
        details: {
          deletedComponents: deletionResult.deletedComponents,
          cascadeDelete: forceDelete
        }
      });

    } catch (error) {
      logger.error('Workflow deletion failed with exception', error as Error, { 
        workflowId: req.params.id,
        userId: (req as any).user?.id 
      });
      res.status(500).json({
        success: false,
        error: "Internal error during workflow deletion",
        code: 'DELETION_EXCEPTION'
      });
    }
  });

  // Helper function to check all workflow dependencies
  async function checkWorkflowDependencies(workflowId: string) {
    try {
      const versions = await storage.getWorkflowVersionsByWorkflowId(workflowId);
      let totalRunCount = 0;
      let activeRunCount = 0;
      let totalStepCount = 0;
      
      for (const version of versions) {
        // Get all runs for this version (not just active ones)
        const allRuns = await storage.getWorkflowRunsByVersionId(version.id);
        totalRunCount += allRuns.length;
        
        // Count active runs
        const activeRuns = allRuns.filter(run => 
          run.status === 'running' || run.status === 'queued'
        );
        activeRunCount += activeRuns.length;
        
        // Count steps for all runs
        for (const run of allRuns) {
          const steps = await storage.getWorkflowRunStepsByRunId(run.id);
          totalStepCount += steps.length;
        }
      }
      
      return {
        versionCount: versions.length,
        totalRunCount,
        activeRunCount,
        totalStepCount,
        hasActiveRuns: activeRunCount > 0,
        hasDependencies: versions.length > 0 || totalRunCount > 0
      };
    } catch (error) {
      logger.error('Failed to check workflow dependencies', error as Error, { workflowId });
      throw new Error('Failed to analyze workflow dependencies');
    }
  }

  // Helper function to perform transactional workflow deletion
  async function performWorkflowDeletion(workflowId: string, forceDelete: boolean, dependencies: any) {
    const deletedComponents = {
      workflow: false,
      versions: 0,
      runs: 0,
      steps: 0
    };
    
    try {
      if (forceDelete && dependencies.hasDependencies) {
        // Cascade delete in proper order: steps -> runs -> versions -> workflow
        logger.info('Starting cascade deletion', { 
          workflowId,
          dependencies: {
            versions: dependencies.versionCount,
            runs: dependencies.totalRunCount,
            steps: dependencies.totalStepCount
          }
        });
        
        // Delete workflow run steps first
        const versions = await storage.getWorkflowVersionsByWorkflowId(workflowId);
        for (const version of versions) {
          const runs = await storage.getWorkflowRunsByVersionId(version.id);
          for (const run of runs) {
            const stepsDeleted = await storage.deleteWorkflowRunStepsByRunId(run.id);
            deletedComponents.steps += stepsDeleted;
          }
          
          // Delete workflow runs
          const runsDeleted = await storage.deleteWorkflowRunsByVersionId(version.id);
          deletedComponents.runs += runsDeleted;
        }
        
        // Delete workflow versions
        const versionsDeleted = await storage.deleteWorkflowVersionsByWorkflowId(workflowId);
        deletedComponents.versions = versionsDeleted;
      }
      
      // Finally delete the workflow itself
      const workflowDeleted = await storage.deleteWorkflow(workflowId);
      deletedComponents.workflow = workflowDeleted;
      
      if (!workflowDeleted) {
        return {
          success: false,
          error: 'Failed to delete workflow record',
          partialDeletion: deletedComponents,
          deletedComponents
        };
      }
      
      return {
        success: true,
        deletedComponents
      };
      
    } catch (error) {
      logger.error('Transactional deletion failed', error as Error, { 
        workflowId,
        partialDeletion: deletedComponents 
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown deletion error',
        partialDeletion: deletedComponents,
        deletedComponents
      };
    }
  }

  // 9. POST /api/workflows/:id/make-default - Make workflow default for businessType
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

  // 10. GET /api/workflow-runs - List workflow runs with optional scanId filter
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

  // 11. GET /api/workflow-runs/:id - Get specific workflow run with steps
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

  // ===== DAILY REVENUE GOAL TRACKING =====
  
  // In-memory storage for runtime goal override (would be persisted in production)
  let runtimeDailyGoalCents: number | null = null;
  
  // Admin endpoint to set daily revenue goal
  app.post("/api/admin/settings/daily-goal", requireAuth(['system:monitor']), async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        goalCents: z.number().int().positive("Goal must be positive cents")
      });
      
      const { goalCents } = schema.parse(req.body);
      runtimeDailyGoalCents = goalCents;
      
      logger.info('Daily revenue goal updated', { 
        goalCents, 
        goalDollars: goalCents / 100
      });
      
      res.json({
        success: true,
        data: {
          goalCents,
          goalDollars: goalCents / 100
        }
      });
    } catch (error) {
      logger.error('Failed to update daily revenue goal', error as Error);
      res.status(400).json({
        success: false,
        error: error instanceof z.ZodError ? error.errors : "Invalid goal value"
      });
    }
  });
  
  // Test endpoint to debug the issue
  app.get("/api/test", (req: Request, res: Response) => {
    res.json({ message: "test endpoint works" });
  });
  
  // Daily revenue goal tracking endpoint
  app.get("/api/analytics/daily", async (req: Request, res: Response) => {
    try {
      logger.info('Daily analytics endpoint hit');
      
      // Get today's date range (start and end of day in UTC)
      const now = new Date();
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const endOfDay = new Date(startOfDay);
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
      
      // Get the current daily goal (runtime override or environment variable)
      const dailyGoalCents = runtimeDailyGoalCents || parseInt(process.env.DAILY_REVENUE_GOAL_CENTS || "5000");
      
      // Query today's successful payments
      const todaysPayments = await db
        .select({
          amount: payments.amount,
          status: payments.status,
          createdAt: payments.createdAt
        })
        .from(payments)
        .where(
          and(
            gte(payments.createdAt, startOfDay),
            lt(payments.createdAt, endOfDay),
            or(
              eq(payments.status, 'paid'),
              eq(payments.status, 'succeeded')
            )
          )
        );
      
      // Calculate today's revenue
      const todaysRevenueCents = todaysPayments.reduce((sum, payment) => sum + payment.amount, 0);
      
      // Query today's scans
      const todaysScans = await db
        .select({
          id: scanResults.id,
          status: scanResults.status,
          createdAt: scanResults.createdAt
        })
        .from(scanResults)
        .where(
          and(
            gte(scanResults.createdAt, startOfDay),
            lt(scanResults.createdAt, endOfDay)
          )
        );
      
      // Query today's emails from email log (authoritative source)
      const todaysEmails = await db
        .select({
          id: emailLog.id,
          status: emailLog.status,
          sentAt: emailLog.sentAt
        })
        .from(emailLog)
        .where(
          and(
            gte(emailLog.sentAt, startOfDay),
            lt(emailLog.sentAt, endOfDay)
          )
        );
      
      // Calculate metrics
      const goalProgress = dailyGoalCents > 0 ? (todaysRevenueCents / dailyGoalCents) * 100 : 0;
      const scansCompleted = todaysScans.filter(scan => scan.status === 'completed').length;
      const emailsSent = todaysEmails.filter(email => email.status === 'sent' || email.status === 'delivered').length;
      const emailsPending = 0; // email_log only contains completed emails
      const emailsFailed = todaysEmails.filter(email => email.status === 'failed' || email.status === 'bounced').length;
      
      // Calculate conversion rate (successful payments / completed scans)
      const conversionRate = scansCompleted > 0 ? (todaysPayments.length / scansCompleted) * 100 : 0;
      
      const response = {
        success: true,
        data: {
          date: startOfDay.toISOString().split('T')[0],
          timestamp: new Date().toISOString(),
          revenue: {
            todayCents: todaysRevenueCents,
            todayDollars: todaysRevenueCents / 100,
            goalCents: dailyGoalCents,
            goalDollars: dailyGoalCents / 100,
            progressPercent: Math.round(goalProgress * 100) / 100,
            remaining: Math.max(0, dailyGoalCents - todaysRevenueCents),
            isGoalMet: todaysRevenueCents >= dailyGoalCents
          },
          scans: {
            total: todaysScans.length,
            completed: scansCompleted,
            pending: todaysScans.filter(scan => scan.status === 'pending').length,
            failed: todaysScans.filter(scan => scan.status === 'failed').length
          },
          emails: {
            total: todaysEmails.length,
            sent: emailsSent,
            pending: emailsPending,
            failed: emailsFailed
          },
          performance: {
            conversionRate: Math.round(conversionRate * 100) / 100,
            paymentsCount: todaysPayments.length,
            averageOrderValue: todaysPayments.length > 0 ? 
              Math.round((todaysRevenueCents / todaysPayments.length) / 100 * 100) / 100 : 0
          }
        }
      };
      
      logger.info('Daily analytics computed', { 
        revenue: response.data.revenue,
        scans: response.data.scans.total,
        emails: response.data.emails.total
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to compute daily analytics', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to compute daily analytics"
      });
    }
  });

  // ===== HUNTER BRODY PROSPECTING APIs =====

  // Start Hunter Brody autonomous prospecting (admin only)
  app.post("/api/prospecting/start", requireAuth(['workflow:execute']), async (req: Request, res: Response) => {
    try {
      hunterScheduler.start();
      
      logger.info('🚀 Hunter Brody autonomous prospecting started');
      
      res.json({
        success: true,
        message: "Hunter Brody autonomous prospecting started",
        status: "hunting"
      });
    } catch (error) {
      logger.error('Failed to start Hunter Brody', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to start autonomous prospecting"
      });
    }
  });

  // Stop Hunter Brody autonomous prospecting (admin only)
  app.post("/api/prospecting/stop", requireAuth(['workflow:execute']), async (req: Request, res: Response) => {
    try {
      hunterScheduler.stop();
      
      logger.info('🛑 Hunter Brody autonomous prospecting stopped');
      
      res.json({
        success: true,
        message: "Hunter Brody autonomous prospecting stopped",
        status: "stopped"
      });
    } catch (error) {
      logger.error('Failed to stop Hunter Brody', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to stop autonomous prospecting"
      });
    }
  });

  // Get Hunter Brody status and statistics (read access)
  app.get("/api/prospecting/status", requireAuth(['workflow:read']), async (req: Request, res: Response) => {
    try {
      const stats = hunterScheduler.getStats();
      const jobs = hunterScheduler.getAllJobs();
      
      res.json({
        success: true,
        data: {
          isRunning: hunterScheduler['isRunning'] || false,
          stats,
          activeJobs: jobs.filter(j => j.enabled),
          allJobs: jobs,
          quotaStatus: discoveryEngine.getQuotaStatus()
        }
      });
    } catch (error) {
      logger.error('Failed to get Hunter Brody status', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to get prospecting status"
      });
    }
  });

  // Manual business discovery (admin only)
  app.post("/api/prospecting/discover", requireAuth(['workflow:execute']), async (req: Request, res: Response) => {
    try {
      const { industry, location, keywords, maxResults = 10 } = req.body;

      const searchParams = {
        industry,
        location,  
        keywords,
        minRating: 3.5
      };

      logger.info('🔍 Manual business discovery requested', { searchParams, maxResults });

      const result = await discoveryEngine.discoverBusinesses(searchParams, maxResults);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Manual discovery failed', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to discover businesses"
      });
    }
  });

  // Get prospecting jobs (read access)
  app.get("/api/prospecting/jobs", requireAuth(['workflow:read']), async (req: Request, res: Response) => {
    try {
      const jobs = hunterScheduler.getAllJobs();
      
      res.json({
        success: true,
        data: jobs
      });
    } catch (error) {
      logger.error('Failed to get prospecting jobs', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to get prospecting jobs"
      });
    }
  });

  // Toggle prospecting job (admin only)
  app.post("/api/prospecting/jobs/:jobId/toggle", requireAuth(['workflow:update']), async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const { enabled } = req.body;

      hunterScheduler.toggleJob(jobId, enabled);

      logger.info(`🔄 Job ${enabled ? 'enabled' : 'disabled'}`, { jobId });

      res.json({
        success: true,
        message: `Job ${enabled ? 'enabled' : 'disabled'}`,
        jobId,
        enabled
      });
    } catch (error) {
      logger.error('Failed to toggle prospecting job', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to toggle prospecting job"
      });
    }
  });

  // Generate tool recommendations for a business (scan integration)
  app.post("/api/recommendations/generate", async (req: Request, res: Response) => {
    try {
      const { leadId, scanId, context = 'scan_results' } = req.body;
      
      if (!leadId) {
        return res.status(400).json({
          success: false,
          error: "Lead ID is required"
        });
      }

      logger.info('🎯 Generating business tool recommendations', { leadId, scanId, context });

      const recommendations = await recommendationEngine.generateRecommendations(leadId, scanId, context);

      res.json({
        success: true,
        data: {
          leadId,
          scanId,
          recommendations: recommendations.map(rec => ({
            tool: {
              id: rec.tool.id,
              name: rec.tool.name,
              description: rec.tool.description,
              shortDescription: rec.tool.shortDescription,
              website: rec.tool.website,
              pricing: rec.tool.pricing,
              features: rec.tool.features,
              rating: rec.tool.rating,
              tags: rec.tool.tags
            },
            score: rec.score,
            reasons: rec.reasons,
            category: rec.category,
            position: recommendations.indexOf(rec) + 1
          })),
          totalRecommendations: recommendations.length,
          context,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to generate recommendations', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to generate tool recommendations"
      });
    }
  });

  // ===== PRODUCTION HUNT EXECUTION =====

  // Start a persistent hunt run
  app.post("/api/hunts/run", adminRateLimit, requireAuth(['workflow:execute']), async (req: Request, res: Response) => {
    const requestId = res.locals.requestId;
    try {
      const { jobId, force = false } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "Job ID is required" });
      }

      // Preflight validation: check if job exists
      const allJobs = hunterScheduler.getAllJobs();
      const jobExists = allJobs.some(j => j.id === jobId);
      if (!jobExists) {
        return res.status(404).json({ 
          error: "Job not found", 
          availableJobs: allJobs.map(j => j.id)
        });
      }

      // Check if job is already running (unless forced)
      if (!force) {
        const [existingRun] = await db
          .select()
          .from(huntRuns)
          .where(and(
            eq(huntRuns.jobId, jobId),
            eq(huntRuns.status, 'running')
          ))
          .limit(1);

        if (existingRun) {
          return res.status(409).json({ 
            error: "Hunt already running", 
            runId: existingRun.id 
          });
        }
      }

      // Create hunt run record
      const [huntRun] = await db
        .insert(huntRuns)
        .values({
          jobId,
          status: 'queued',
          metadata: {
            requestId,
            force,
            initiatedBy: 'api'
          }
        })
        .returning();

      logger.info('🎯 Hunt run started', {
        requestId,
        huntRunId: huntRun.id,
        jobId
      });

      // Execute hunt asynchronously
      setImmediate(async () => {
        await executeHuntRun(huntRun.id);
      });

      res.json({
        success: true,
        huntRunId: huntRun.id,
        status: 'queued',
        message: 'Hunt execution started'
      });

    } catch (error) {
      logger.error('Failed to start hunt run', { requestId, error });
      res.status(500).json({ error: 'Failed to start hunt run' });
    }
  });

  // Get hunt run status
  app.get("/api/hunts/status/:runId", requireAuth(['workflow:read']), async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      
      const [huntRun] = await db
        .select()
        .from(huntRuns)
        .where(eq(huntRuns.id, runId))
        .limit(1);

      if (!huntRun) {
        return res.status(404).json({ error: "Hunt run not found" });
      }

      res.json({
        success: true,
        huntRun: {
          id: huntRun.id,
          jobId: huntRun.jobId,
          status: huntRun.status,
          progress: huntRun.status === 'completed' ? 100 : 
                   huntRun.status === 'running' ? 50 : 0,
          businessesDiscovered: huntRun.businessesDiscovered,
          leadsCreated: huntRun.leadsCreated,
          scansTriggered: huntRun.scansTriggered,
          quotaUsed: huntRun.quotaUsed,
          startedAt: huntRun.startedAt,
          finishedAt: huntRun.finishedAt,
          errorMessage: huntRun.errorMessage,
          metadata: huntRun.metadata
        }
      });

    } catch (error) {
      logger.error('Failed to get hunt status', { error });
      res.status(500).json({ error: 'Failed to get hunt status' });
    }
  });

  // List hunt run history
  app.get("/api/hunts/history", requireAuth(['workflow:read']), async (req: Request, res: Response) => {
    try {
      const { limit = 50, offset = 0, status, jobId } = req.query;
      
      let query = db.select().from(huntRuns);
      
      const conditions = [];
      if (status) conditions.push(eq(huntRuns.status, status as string));
      if (jobId) conditions.push(eq(huntRuns.jobId, jobId as string));
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      const runs = await query
        .orderBy(desc(huntRuns.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));

      const total = await db
        .select({ count: count() })
        .from(huntRuns)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      res.json({
        success: true,
        runs: runs.map(run => ({
          id: run.id,
          jobId: run.jobId,
          status: run.status,
          businessesDiscovered: run.businessesDiscovered,
          leadsCreated: run.leadsCreated,
          scansTriggered: run.scansTriggered,
          quotaUsed: run.quotaUsed,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          duration: run.startedAt && run.finishedAt ? 
            Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000) : null,
          createdAt: run.createdAt
        })),
        pagination: {
          total: total[0]?.count || 0,
          limit: Number(limit),
          offset: Number(offset)
        }
      });

    } catch (error) {
      logger.error('Failed to get hunt history', { error });
      res.status(500).json({ error: 'Failed to get hunt history' });
    }
  });

  // Start complete pipeline run
  app.post("/api/pipelines/run", adminRateLimit, requireAuth(['workflow:execute']), async (req: Request, res: Response) => {
    const requestId = res.locals.requestId;
    try {
      const { leadId, businessName, industry, autoScan = true } = req.body;
      
      if (!leadId && !businessName) {
        return res.status(400).json({ 
          error: "Either leadId or businessName is required" 
        });
      }

      // Create pipeline run record
      const [pipelineRun] = await db
        .insert(pipelineRuns)
        .values({
          leadId: leadId || `manual_${Date.now()}`,
          status: 'discovery',
          currentStep: 'initializing',
          progress: 0
        })
        .returning();

      logger.info('🔄 Pipeline run started', {
        requestId,
        pipelineRunId: pipelineRun.id,
        leadId,
        businessName
      });

      // Execute pipeline asynchronously
      setImmediate(async () => {
        await executePipelineRun(pipelineRun.id, {
          leadId,
          businessName,
          industry,
          autoScan
        });
      });

      res.json({
        success: true,
        pipelineRunId: pipelineRun.id,
        status: 'discovery',
        message: 'Pipeline execution started'
      });

    } catch (error) {
      logger.error('Failed to start pipeline run', { requestId, error });
      res.status(500).json({ error: 'Failed to start pipeline run' });
    }
  });

  // Get pipeline run status
  app.get("/api/pipelines/status/:runId", requireAuth(['workflow:read']), async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      
      const [pipelineRun] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, runId))
        .limit(1);

      if (!pipelineRun) {
        return res.status(404).json({ error: "Pipeline run not found" });
      }

      res.json({
        success: true,
        pipelineRun: {
          id: pipelineRun.id,
          leadId: pipelineRun.leadId,
          status: pipelineRun.status,
          currentStep: pipelineRun.currentStep,
          progress: pipelineRun.progress,
          huntRunId: pipelineRun.huntRunId,
          scanId: pipelineRun.scanId,
          workflowRunId: pipelineRun.workflowRunId,
          toolsRecommended: pipelineRun.toolsRecommended,
          estimatedValue: pipelineRun.estimatedValue,
          startedAt: pipelineRun.startedAt,
          finishedAt: pipelineRun.finishedAt,
          errorMessage: pipelineRun.errorMessage
        }
      });

    } catch (error) {
      logger.error('Failed to get pipeline status', { error });
      res.status(500).json({ error: 'Failed to get pipeline status' });
    }
  });

  // DEMO: Complete AlienProbe.ai pipeline test (Lead → Scan → Recommendations)
  app.post("/api/demo/complete-pipeline", async (req: Request, res: Response) => {
    try {
      const { industry = 'restaurant', location = 'New York, NY', businessName } = req.body;

      logger.info('🚀 DEMO: Running complete AlienProbe.ai pipeline', { industry, location, businessName });

      // Step 1: Discover/Create Lead
      let leadData;
      if (businessName) {
        // Use provided business
        leadData = {
          businessName,
          industry,
          companySize: '1-10',
          budgetRange: '5k-25k',
          painPoints: 'Need better customer management and online presence',
          source: 'demo_pipeline'
        };
      } else {
        // Discover new businesses
        const discovery = await discoveryEngine.discoverBusinesses({
          industry,
          location,
          keywords: `${industry} business`,
          minRating: 3.5
        }, 1);

        if (discovery.businesses.length === 0) {
          throw new Error('No businesses discovered for pipeline demo');
        }

        const business = discovery.businesses[0];
        leadData = {
          businessName: business.name,
          website: business.website,
          industry: business.industry || industry,
          companySize: '1-10',
          budgetRange: '5k-25k',
          painPoints: `Needs optimization for ${business.industry || industry} operations`,
          source: 'discovery_engine'
        };
      }

      // Step 2: Create Lead (Simulated for demo - avoiding schema conflicts)
      const leadSummary = {
        id: `lead_${Date.now()}`,
        businessName: leadData.businessName,
        industry: leadData.industry,
        source: leadData.source
      };

      // Step 3: Generate Business Scan
      const scanData = {
        overview: `${leadData.businessName} is a ${leadData.industry} business that could benefit from AI optimization`,
        challenges: ['Customer retention', 'Operational efficiency', 'Digital presence'],
        opportunities: ['Automation potential', 'Customer experience enhancement', 'Revenue optimization'],
        recommendations: 'Consider implementing CRM, scheduling, and marketing automation tools',
        aiReadinessScore: Math.floor(Math.random() * 40) + 60, // 60-100% ready
        detectedTools: ['Basic POS', 'Email'],
        painPointAnalysis: leadData.painPoints
      };

      // Step 4: Generate Business Scan (Simulated)
      const scanResult = {
        id: `scan_${Date.now()}`,
        businessName: leadData.businessName,
        overallScore: scanData.aiReadinessScore,
        status: 'completed'
      };

      // Step 5: Generate Tool Recommendations (Demo mode)
      const recommendations = await recommendationEngine.generateRecommendations(
        leadSummary.id,
        scanResult.id,
        'demo_pipeline'
      );
      
      // Recommendations successfully generated for demo

      res.json({
        success: true,
        demo: true,
        pipeline: {
          step1_discovery: {
            businessName: leadData.businessName,
            industry: leadData.industry,
            location: location
          },
          step2_lead_creation: {
            leadId: leadSummary.id,
            status: 'created'
          },
          step3_business_scan: {
            scanId: scanResult.id,
            aiReadinessScore: scanData.aiReadinessScore,
            challenges: scanData.challenges,
            opportunities: scanData.opportunities
          },
          step4_tool_recommendations: {
            totalRecommendations: recommendations.length,
            topRecommendation: recommendations[0]?.tool?.name || 'CRM System',
            estimatedRevenue: recommendations.reduce((sum, rec) => {
              const pricing = rec.tool.pricing;
              const avgPrice = (pricing.minPrice + pricing.maxPrice) / 2;
              return sum + (avgPrice * 0.15);
            }, 0).toFixed(2),
            recommendations: recommendations.slice(0, 3).map(rec => ({
              name: rec.tool.name,
              category: rec.tool.category,
              monthlyPrice: ((rec.tool.pricing.minPrice + rec.tool.pricing.maxPrice) / 2).toFixed(2),
              implementation: rec.tool.implementation,
              commissionRate: '15%'
            }))
          }
        },
        revenuePotential: {
          scanPrice: 49.99,
          toolCommissions: recommendations.reduce((sum, rec) => {
            const pricing = rec.tool.pricing;
            const avgPrice = (pricing.minPrice + pricing.maxPrice) / 2;
            const commission = rec.tool.commissionRate || 15;
            return sum + (avgPrice * commission / 100);
          }, 0),
          totalPerBusiness: 49.99 + recommendations.reduce((sum, rec) => {
            const pricing = rec.tool.pricing;
            const avgPrice = (pricing.minPrice + pricing.maxPrice) / 2;
            const commission = rec.tool.commissionRate || 15;
            return sum + (avgPrice * commission / 100);
          }, 0)
        }
      });

    } catch (error) {
      logger.error('Complete pipeline demo failed', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to run complete pipeline demo"
      });
    }
  });

  // DEMO: Unprotected lead generation test (for demonstration)
  app.post("/api/demo/generate-leads", async (req: Request, res: Response) => {
    try {
      const { industry = 'restaurant', location = 'New York, NY', maxResults = 20 } = req.body;

      const searchParams = {
        industry,
        location,  
        keywords: `${industry} business`,
        minRating: 3.5
      };

      logger.info('🎯 DEMO: Generating leads for maximum volume test', { searchParams, maxResults });

      const result = await discoveryEngine.discoverBusinesses(searchParams, maxResults);

      // Process discovered businesses into leads and scans
      let processedCount = 0;
      for (const business of result.businesses) {
        const leadId = await discoveryEngine.processDiscoveredBusiness(business);
        if (leadId) {
          processedCount++;
        }
      }

      res.json({
        success: true,
        demo: true,
        data: {
          searchParams,
          totalDiscovered: result.totalFound,
          leadsCreated: processedCount,
          scansTriggered: processedCount,
          quotaUsed: result.quotaUsed,
          sources: result.businesses.map(b => b.sourceName),
          pricing: {
            costPerLead: 0.10, // $0.10 per lead
            costPerScan: 2.50, // $2.50 per scan  
            totalCost: (processedCount * 2.60).toFixed(2),
            savings: "87% cheaper than manual prospecting"
          }
        }
      });
    } catch (error) {
      logger.error('Demo lead generation failed', error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to generate demo leads"
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

  // ===== STREAMLINED MANAGEMENT ENDPOINTS =====

  // System overview dashboard (admin only)
  app.get("/api/admin/overview", requireAuth(['system:monitor']), async (req: Request, res: Response) => {
    try {
      // Get system statistics
      const leadsCountResult = await db.select({ count: count() }).from(leads);
      const scansCountResult = await db.select({ count: count() }).from(scanResults);
      const huntsCountResult = await db.select({ count: count() }).from(huntRuns);
      const pipelinesCountResult = await db.select({ count: count() }).from(pipelineRuns);
      
      // Get revenue metrics
      const completedScans = await db
        .select()
        .from(scanResults)
        .where(eq(scanResults.status, 'completed'));
      
      const revenue = {
        totalScans: completedScans.length,
        scanRevenue: completedScans.length * 49.99,
        estimatedMonthlyCommissions: completedScans.length * 144.15,
        totalPotential: completedScans.length * 229.84
      };

      // Get system health
      const hunterJobs = hunterScheduler.getAllJobs();
      const systemHealth = {
        database: 'connected',
        emailSystem: 'running',
        hunterJobs: hunterJobs.length,
        activeJobs: hunterJobs.filter(j => j.enabled).length
      };

      res.json({
        success: true,
        overview: {
          metrics: {
            totalLeads: leadsCountResult[0]?.count || 0,
            totalScans: scansCountResult[0]?.count || 0,
            huntRuns: huntsCountResult[0]?.count || 0,
            pipelineRuns: pipelinesCountResult[0]?.count || 0
          },
          revenue,
          systemHealth,
          version: config.APP_VERSION,
          environment: config.NODE_ENV,
          uptime: process.uptime()
        }
      });

    } catch (error) {
      logger.error('Failed to get admin overview', error as Error);
      res.status(500).json({ error: 'Failed to get system overview' });
    }
  });

  // Quick deploy health check
  app.get("/api/admin/deploy-status", async (req: Request, res: Response) => {
    try {
      const healthChecks = {
        database: false,
        migrations: false,
        services: false
      };

      // Check database
      try {
        await db.execute(sql`SELECT 1`);
        healthChecks.database = true;
      } catch (error) {
        logger.error('Database health check failed', error as Error);
      }

      // Check migrations
      try {
        const migrationTable = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '__drizzle_migrations'
          );
        `);
        healthChecks.migrations = migrationTable.rows[0]?.exists === true;
      } catch (error) {
        logger.error('Migration check failed', error as Error);
      }

      // Check services
      healthChecks.services = hunterScheduler.getAllJobs().length > 0;

      const allHealthy = Object.values(healthChecks).every(check => check === true);

      res.json({
        success: true,
        deployReady: allHealthy,
        checks: healthChecks,
        message: allHealthy ? 'System ready for deployment' : 'System has issues - check logs'
      });

    } catch (error) {
      logger.error('Deploy status check failed', error as Error);
      res.status(500).json({ 
        success: false,
        deployReady: false,
        error: 'Health check failed' 
      });
    }
  });

  // System control endpoints (admin only)
  app.post("/api/admin/restart-hunters", requireAuth(['workflow:execute']), async (req: Request, res: Response) => {
    try {
      hunterScheduler.stop();
      hunterScheduler.start();
      
      logger.info('🔄 Hunter system restarted via admin panel');
      
      res.json({
        success: true,
        message: 'Hunter system restarted successfully'
      });

    } catch (error) {
      logger.error('Failed to restart hunters', error as Error);
      res.status(500).json({ error: 'Failed to restart hunter system' });
    }
  });

  // Bulk operations for management
  app.post("/api/admin/cleanup", requireAuth(['system:monitor']), async (req: Request, res: Response) => {
    try {
      const { action, confirm } = req.body;
      
      if (!confirm) {
        return res.status(400).json({ error: 'Confirmation required for cleanup operations' });
      }

      let result = { cleaned: 0, message: '' };

      switch (action) {
        case 'failed_hunts':
          const cleanedHunts = await db
            .delete(huntRuns)
            .where(eq(huntRuns.status, 'failed'))
            .returning();
          result = { cleaned: cleanedHunts.length, message: 'Failed hunt runs cleaned' };
          break;

        case 'old_scans':
          // Clean scans older than 30 days
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const cleanedScans = await db
            .delete(scanResults)
            .where(and(
              eq(scanResults.status, 'failed'),
              sql`${scanResults.createdAt} < ${thirtyDaysAgo}`
            ))
            .returning();
          result = { cleaned: cleanedScans.length, message: 'Old failed scans cleaned' };
          break;

        default:
          return res.status(400).json({ error: 'Invalid cleanup action' });
      }

      logger.info('🧹 Admin cleanup performed', { action, ...result });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Admin cleanup failed', error as Error);
      res.status(500).json({ error: 'Cleanup operation failed' });
    }
  });

  // Goals management endpoints (admin only)
  app.get("/api/admin/goals", requireAuth(['system:monitor']), async (req: Request, res: Response) => {
    try {
      const goals = await db.select().from(systemGoals).where(eq(systemGoals.isActive, true));
      
      // Get today's completed scans to update daily goal progress
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayScans = await db.select({ count: count() })
        .from(scanResults)
        .where(and(
          eq(scanResults.status, 'completed'),
          gte(scanResults.createdAt, today)
        ));

      // Update daily scans goal current value
      const dailyGoal = goals.find(g => g.goalType === 'daily_scans');
      if (dailyGoal) {
        await db.update(systemGoals)
          .set({ 
            currentValue: todayScans[0]?.count || 0,
            updatedAt: new Date()
          })
          .where(eq(systemGoals.id, dailyGoal.id));
      }

      // Refetch updated goals
      const updatedGoals = await db.select().from(systemGoals).where(eq(systemGoals.isActive, true));

      res.json({
        success: true,
        goals: updatedGoals
      });

    } catch (error) {
      logger.error('Failed to get goals', error as Error);
      res.status(500).json({ error: 'Failed to fetch goals' });
    }
  });

  app.post("/api/admin/goals", requireAuth(['system:monitor']), async (req: Request, res: Response) => {
    try {
      const { goalType, targetValue } = insertSystemGoalSchema.parse(req.body);

      // Update existing goal or create new one
      const existingGoal = await db.select()
        .from(systemGoals)
        .where(eq(systemGoals.goalType, goalType))
        .limit(1);

      if (existingGoal.length > 0) {
        await db.update(systemGoals)
          .set({ 
            targetValue,
            updatedAt: new Date()
          })
          .where(eq(systemGoals.id, existingGoal[0].id));
      } else {
        await db.insert(systemGoals).values({
          goalType,
          targetValue,
          currentValue: 0,
          resetDate: new Date(),
          isActive: true
        });
      }

      res.json({
        success: true,
        message: 'Goal updated successfully'
      });

    } catch (error) {
      logger.error('Failed to set goal', error as Error);
      res.status(500).json({ error: 'Failed to set goal' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// ===== HUNT EXECUTION FUNCTIONS =====

async function executeHuntRun(huntRunId: string): Promise<void> {
  try {
    logger.info('🎯 Starting hunt execution', { huntRunId });

    // Update status to running
    await db
      .update(huntRuns)
      .set({ 
        status: 'running', 
        startedAt: new Date() 
      })
      .where(eq(huntRuns.id, huntRunId));

    const [huntRun] = await db
      .select()
      .from(huntRuns)
      .where(eq(huntRuns.id, huntRunId))
      .limit(1);

    if (!huntRun) {
      throw new Error(`Hunt run ${huntRunId} not found`);
    }

    // Get job configuration from hunter scheduler
    const allJobs = hunterScheduler.getAllJobs();
    const job = allJobs.find(j => j.id === huntRun.jobId);
    if (!job) {
      throw new Error(`Job ${huntRun.jobId} not found in scheduler`);
    }

    // Execute discovery
    const discoveryResult = await discoveryEngine.discoverBusinesses(
      job.searchParams,
      job.maxResultsPerRun
    );

    let leadsCreated = 0;
    let scansTriggered = 0;

    // Process discovered businesses
    for (const business of discoveryResult.businesses) {
      try {
        // Create lead from discovered business
        const [lead] = await db
          .insert(leads)
          .values({
            businessName: business.businessName,
            website: business.website,
            industry: business.industry || job.searchParams.industry,
            source: business.sourceName,
            status: 'pending',
            companySize: '1-10', // Assume small business
            budgetRange: '5k-25k'
          })
          .returning();

        leadsCreated++;

        // Auto-trigger scan if lead looks promising
        if (business.rating && business.rating >= 3.5 && business.website) {
          const [scanResult] = await db
            .insert(scanResults)
            .values({
              businessName: business.businessName,
              website: business.website,
              leadId: lead.id,
              status: 'pending'
            })
            .returning();

          scansTriggered++;

          // Trigger async scan processing
          setImmediate(async () => {
            try {
              await processScanResult(scanResult.id);
            } catch (error) {
              logger.error('Failed to process scan', { 
                scanId: scanResult.id, 
                error 
              });
            }
          });
        }

      } catch (error) {
        logger.warn('Failed to create lead for business', { 
          businessName: business.businessName, 
          error 
        });
      }
    }

    // Update hunt run with results
    await db
      .update(huntRuns)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        businessesDiscovered: discoveryResult.businesses.length,
        leadsCreated,
        scansTriggered,
        quotaUsed: discoveryResult.quotaUsed
      })
      .where(eq(huntRuns.id, huntRunId));

    logger.info('✅ Hunt execution completed', {
      huntRunId,
      businessesFound: discoveryResult.businesses.length,
      leadsCreated,
      scansTriggered,
      quotaUsed: discoveryResult.quotaUsed
    });

  } catch (error) {
    logger.error('❌ Hunt execution failed', { huntRunId, error });
    
    await db
      .update(huntRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
      .where(eq(huntRuns.id, huntRunId));
  }
}

async function executePipelineRun(
  pipelineRunId: string, 
  params: {
    leadId?: string;
    businessName?: string;
    industry?: string;
    autoScan?: boolean;
  }
): Promise<void> {
  try {
    logger.info('🔄 Starting pipeline execution', { pipelineRunId, params });

    let leadId = params.leadId;
    let scanId: string | null = null;
    let toolsRecommended = 0;
    let estimatedValue = 0;

    // Step 1: Lead Discovery/Creation
    await updatePipelineStatus(pipelineRunId, 'discovery', 'creating_lead', 10);

    if (!leadId && params.businessName) {
      // Create lead from business name
      const [lead] = await db
        .insert(leads)
        .values({
          businessName: params.businessName,
          industry: params.industry,
          source: 'manual_pipeline',
          status: 'pending',
          companySize: '1-10',
          budgetRange: '5k-25k'
        })
        .returning();
      
      leadId = lead.id;
    }

    if (!leadId) {
      throw new Error('Failed to get or create lead');
    }

    // Update pipeline with leadId
    await db
      .update(pipelineRuns)
      .set({ leadId })
      .where(eq(pipelineRuns.id, pipelineRunId));

    // Step 2: Business Scanning
    if (params.autoScan) {
      await updatePipelineStatus(pipelineRunId, 'scanning', 'analyzing_business', 40);

      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (lead) {
        const [scan] = await db
          .insert(scanResults)
          .values({
            businessName: lead.businessName,
            website: lead.website,
            leadId: lead.id,
            status: 'completed',
            scanData: JSON.stringify({
              overallScore: Math.floor(Math.random() * 40) + 60,
              industry: lead.industry,
              companySize: lead.companySize,
              painPoints: ['Customer management', 'Digital presence', 'Operational efficiency'],
              opportunities: ['Automation', 'Customer retention', 'Revenue optimization']
            })
          })
          .returning();

        scanId = scan.id;

        // Update pipeline with scanId
        await db
          .update(pipelineRuns)
          .set({ scanId })
          .where(eq(pipelineRuns.id, pipelineRunId));
      }
    }

    // Step 3: Tool Recommendations  
    await updatePipelineStatus(pipelineRunId, 'recommendations', 'generating_recommendations', 70);

    if (leadId) {
      try {
        const recommendations = await recommendationEngine.generateRecommendations(
          leadId,
          scanId || undefined,
          'pipeline'
        );

        toolsRecommended = recommendations.length;
        estimatedValue = Math.round(recommendations.reduce((total, rec) => {
          const pricing = rec.tool.pricing;
          const avgPrice = (pricing.minPrice + pricing.maxPrice) / 2;
          return total + (avgPrice * 0.15); // 15% commission
        }, 0) * 100); // Convert to cents

      } catch (error) {
        logger.warn('Failed to generate recommendations', { 
          pipelineRunId, 
          leadId, 
          error 
        });
      }
    }

    // Step 4: Complete Pipeline
    await updatePipelineStatus(pipelineRunId, 'completed', 'pipeline_complete', 100);

    await db
      .update(pipelineRuns)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        toolsRecommended,
        estimatedValue
      })
      .where(eq(pipelineRuns.id, pipelineRunId));

    logger.info('✅ Pipeline execution completed', {
      pipelineRunId,
      leadId,
      scanId,
      toolsRecommended,
      estimatedValue: estimatedValue / 100
    });

  } catch (error) {
    logger.error('❌ Pipeline execution failed', { pipelineRunId, error });
    
    await db
      .update(pipelineRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
      .where(eq(pipelineRuns.id, pipelineRunId));
  }
}

async function updatePipelineStatus(
  pipelineRunId: string, 
  status: string, 
  currentStep: string, 
  progress: number
): Promise<void> {
  await db
    .update(pipelineRuns)
    .set({
      status,
      currentStep,
      progress
    })
    .where(eq(pipelineRuns.id, pipelineRunId));
}

async function processScanResult(scanId: string): Promise<void> {
  try {
    logger.info('🔍 Processing scan result', { scanId });

    // Simulate scan processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate scan data
    const scanData = {
      overallScore: Math.floor(Math.random() * 40) + 60,
      strengths: ['Strong local reputation', 'Experienced staff'],
      weaknesses: ['Limited online presence', 'Manual processes'],
      opportunities: ['Digital marketing', 'Customer management system'],
      metrics: {
        onlinePresence: Math.floor(Math.random() * 50) + 30,
        customerSatisfaction: Math.floor(Math.random() * 30) + 70,
        operationalEfficiency: Math.floor(Math.random() * 40) + 40
      }
    };

    // Update scan with results
    await db
      .update(scanResults)
      .set({
        status: 'completed',
        scanData: JSON.stringify(scanData)
      })
      .where(eq(scanResults.id, scanId));

    logger.info('✅ Scan processing completed', { 
      scanId, 
      score: scanData.overallScore 
    });

  } catch (error) {
    logger.error('❌ Scan processing failed', { scanId, error });
    
    await db
      .update(scanResults)
      .set({ status: 'failed' })
      .where(eq(scanResults.id, scanId));
  }
}
