import { z } from "zod";
import { classifyEmailDomain, shouldFlagLead, getFlaggingReason } from "../utils/emailDomainFilter";
import { URL } from "url";
import { createHash } from "crypto";
import { executeTool } from "./toolRegistry";
import { reportGenerator } from "../utils/reportGenerator";
import { emailTemplateManager } from "../email/templates";
import { emailMailer } from "../email/mailer";
import type { ToolTemplate } from "@shared/schema";

// Strong typing for workflow context data structure
export interface WorkflowContextData {
  businessName?: string;
  website?: string;
  email?: string;
  contactName?: string;
  scanData?: unknown;
  previousStepResults?: Record<string, unknown>;
  leadId?: string;
  scanId?: string;
  workflowId?: string;
  // Website metadata properties
  websiteContent?: string;
  websiteMetadata?: {
    title?: string;
    description?: string;
    finalUrl?: string;
    statusCode?: number;
    contentType?: string;
    contentLength?: number;
    hasHttps?: boolean;
    technologies?: Record<string, boolean>;
    headers?: Record<string, string>;
    [key: string]: unknown;
  };
  // Email and contact properties
  foundEmails?: string[];
  suggestedEmails?: string[];
  recommendedEmail?: string;
  // SEO analysis properties
  seoAnalysis?: {
    score?: number;
    issues?: string[];
    recommendations?: string[];
    technicalSeo?: Record<string, unknown>;
    contentSeo?: Record<string, unknown>;
    summary?: string;
    overallScore?: number;
    strengths?: string[];
    weaknesses?: string[];
    [key: string]: unknown;
  };
  // Email validation and enrichment results
  emailValidation?: {
    summary?: {
      totalEmails?: number;
      validEmails?: number;
      businessEmails?: number;
      personalEmails?: number;
      disposableEmails?: number;
      flaggedEmails?: number;
    };
    recommendedEmail?: string;
    results?: any[];
    [key: string]: unknown;
  };
  emailEnrichment?: {
    foundEmails?: string[];
    suggestedEmails?: string[];
    extractedFromContent?: string[];
    domain?: string;
    businessName?: string;
    [key: string]: unknown;
  };
  // Business scoring results
  businessScoring?: {
    seoScore?: number;
    emailScore?: number;
    websiteScore?: number;
    technicalScore?: number;
    overallScore?: number;
    maxPossibleScore?: number;
    factors?: Record<string, any>;
    recommendations?: string[];
    strengths?: string[];
    weaknesses?: string[];
    scoringDate?: string;
    [key: string]: unknown;
  };
  // Tool execution properties
  tools?: Record<string, unknown>;
  // Workflow definition for tool execution
  workflowDefinition?: {
    tools?: {
      templates?: any[];
    };
    [key: string]: unknown;
  };
  // Final scan results and workflow status
  finalScanResults?: any;
  scanStatus?: string;
  completedAt?: string;
  reportSent?: boolean;
  reportDeliveryResults?: any;
  lastNoopStep?: any;
  websiteUrl?: string;
  // Allow additional properties while maintaining type safety
  [key: string]: unknown;
}

// Logger metadata with specific workflow-related fields
export interface LogMetadata {
  stepKey?: string;
  stepType?: string;
  workflowId?: string;
  runId?: string;
  attempt?: number;
  duration?: number;
  status?: string;
  error?: string;
  // Allow additional metadata while maintaining type safety
  [key: string]: unknown;
}

// Step configuration with better typing
export interface StepConfig {
  // Common step configuration properties
  timeout?: number;
  retries?: number;
  enabled?: boolean;
  // Allow step-specific configuration
  [key: string]: unknown;
}

// Step outputs with structured types
export interface StepOutputs {
  success?: boolean;
  data?: unknown;
  error?: string;
  nextStep?: string;
  // Allow additional outputs
  [key: string]: unknown;
}

/**
 * Context passed to each step during workflow execution
 */
export interface StepContext {
  /** Current workflow run ID */
  runId: string;
  /** Optional scan result ID for scan-related workflows */
  scanId?: string;
  /** Optional lead ID for lead-related workflows */
  leadId?: string;
  /** Shared context data that persists across steps */
  data: WorkflowContextData;
  /** Storage interface for database operations */
  storage: import('../storage').IStorage;
  /** Logger instance for step logging */
  logger: {
    info: (message: string, meta?: LogMetadata) => void;
    warn: (message: string, meta?: LogMetadata) => void;
    error: (message: string, meta?: LogMetadata) => void;
  };
}

/**
 * Result returned by step execution
 */
export interface StepResult {
  /** Context updates to merge into workflow context */
  updates?: Partial<WorkflowContextData>;
  /** Step output data for subsequent steps */
  outputs?: StepOutputs;
}

/**
 * Configuration for a workflow step instance
 */
export interface WorkflowStepConfig {
  /** Unique key for this step within the workflow */
  key: string;
  /** Step type identifier */
  type: string;
  /** Step-specific configuration */
  config: StepConfig;
  /** Optional step name for display */
  name?: string;
  /** Optional step description */
  description?: string;
}

/**
 * Definition of a step type in the registry
 */
export interface StepDefinition<TSchema extends z.ZodType = z.ZodType> {
  /** Zod schema for validating step configuration */
  configSchema: TSchema;
  /** Function to execute the step */
  run: (context: StepContext, config: z.output<TSchema>) => Promise<StepResult>;
  /** Optional step type description */
  description?: string;
}

/**
 * Type-safe step registry mapping step types to their definitions
 */
export type StepRegistry = Record<string, StepDefinition>;

/**
 * Index signature interface for step registry to enable dynamic lookups
 */
export interface IStepRegistry {
  [key: string]: StepDefinition;
  fetchWebsite: StepDefinition;
  seoScan: StepDefinition;
  emailEnrichment: StepDefinition;
  validateEmailDomain: StepDefinition;
  businessScoring: StepDefinition;
  finalizeScan: StepDefinition;
  toolCall: StepDefinition;
  noop: StepDefinition;
  sendScanReport: StepDefinition;
}

/**
 * Helper function to safely handle async operations with error logging
 */
async function safeExecute<T>(
  context: StepContext,
  stepType: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    context.logger?.error(`Error in ${stepType} step:`, { error: errorMessage, runId: context.runId });
    throw new Error(`${stepType} step failed: ${errorMessage}`);
  }
}

// =================== SECURITY UTILITIES ===================

/**
 * URL Security Validator - Prevents SSRF attacks
 */
export class URLSecurityValidator {
  private static readonly PRIVATE_IP_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
    /^localhost$/i
  ];

  private static readonly ALLOWED_SCHEMES = ['http:', 'https:'];
  
  private static readonly BLOCKED_DOMAINS = [
    'localhost',
    'metadata.google.internal',
    '169.254.169.254',
    'metadata.aws.internal'
  ];

  /**
   * Validates URL for SSRF vulnerabilities
   */
  static async validateURL(urlString: string): Promise<{ isValid: boolean; error?: string; hostname?: string }> {
    try {
      const url = new URL(urlString);
      
      // Check scheme
      if (!this.ALLOWED_SCHEMES.includes(url.protocol)) {
        return { isValid: false, error: `Unsupported protocol: ${url.protocol}` };
      }

      // Check blocked domains
      const hostname = url.hostname.toLowerCase();
      if (this.BLOCKED_DOMAINS.includes(hostname)) {
        return { isValid: false, error: `Blocked domain: ${hostname}` };
      }

      // Check for private IP ranges
      if (this.isPrivateIP(hostname)) {
        return { isValid: false, error: `Private IP address not allowed: ${hostname}` };
      }

      // Additional DNS resolution check to prevent bypasses
      try {
        const dns = await import('dns');
        const addresses = await new Promise<string[]>((resolve, reject) => {
          dns.resolve4(hostname, (err, addresses) => {
            if (err) {
              // If DNS resolution fails, still allow the request for legitimate domains
              resolve([]);
            } else {
              resolve(addresses);
            }
          });
        });

        // Check resolved IPs for private ranges
        for (const ip of addresses) {
          if (this.isPrivateIP(ip)) {
            return { isValid: false, error: `Domain resolves to private IP: ${ip}` };
          }
        }
      } catch (dnsError) {
        // DNS check failed, but allow request to proceed for legitimate domains
        // This prevents DNS failures from blocking legitimate requests
      }

      return { isValid: true, hostname };
    } catch (error) {
      return { isValid: false, error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  /**
   * Check if an IP address or hostname is in private ranges
   */
  private static isPrivateIP(address: string): boolean {
    return this.PRIVATE_IP_RANGES.some(pattern => pattern.test(address));
  }
}

/**
 * Safe Expression Evaluator - Replaces Function() for edge conditions
 */
class SafeExpressionEvaluator {
  private static readonly ALLOWED_OPERATORS = ['===', '!==', '==', '!=', '>', '<', '>=', '<=', '&&', '||'];
  private static readonly ALLOWED_LITERALS = /^(true|false|null|undefined|\d+(\.\d+)?|"[^"]*"|'[^']*')$/;
  private static readonly ALLOWED_PROPERTIES = /^(data|metadata)\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

  /**
   * Safely evaluate simple boolean expressions for workflow conditions
   */
  static evaluateCondition(condition: string, context: { data: any; metadata: any }): boolean {
    try {
      // Sanitize the condition string
      const sanitized = this.sanitizeExpression(condition.trim());
      
      if (!sanitized.isValid) {
        throw new Error(`Invalid condition expression: ${sanitized.error}`);
      }

      // Parse and evaluate the expression safely
      return this.parseAndEvaluate(sanitized.expression, context);
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sanitize expression to ensure it only contains safe operations
   */
  private static sanitizeExpression(expr: string): { isValid: boolean; expression: string; error?: string } {
    // Remove extra whitespace
    expr = expr.replace(/\s+/g, ' ').trim();

    // Check for dangerous patterns
    if (expr.includes('eval') || expr.includes('Function') || expr.includes('__proto__') || 
        expr.includes('constructor') || expr.includes('prototype')) {
      return { isValid: false, expression: '', error: 'Dangerous expression patterns detected' };
    }

    // Basic validation for allowed patterns
    const tokens = this.tokenize(expr);
    for (const token of tokens) {
      if (!this.isValidToken(token)) {
        return { isValid: false, expression: '', error: `Invalid token: ${token}` };
      }
    }

    return { isValid: true, expression: expr };
  }

  /**
   * Tokenize expression into manageable parts
   */
  private static tokenize(expr: string): string[] {
    // Simple tokenization - split on operators and whitespace while preserving structure
    return expr.split(/\s*(===|!==|==|!=|>=|<=|>|<|&&|\|\||[()\s])\s*/).filter(token => token.trim() !== '');
  }

  /**
   * Validate individual tokens
   */
  private static isValidToken(token: string): boolean {
    if (this.ALLOWED_OPERATORS.includes(token)) return true;
    if (this.ALLOWED_LITERALS.test(token)) return true;
    if (this.ALLOWED_PROPERTIES.test(token)) return true;
    if (token === '(' || token === ')') return true;
    return false;
  }

  /**
   * Parse and evaluate expression using safe evaluation
   */
  private static parseAndEvaluate(expr: string, context: { data: any; metadata: any }): boolean {
    // For now, implement a simple recursive descent parser for basic comparisons
    // This is a simplified implementation - in production, consider using a proper expression parser
    
    // Replace property access with actual values
    let evaluatedExpr = expr;
    
    // Replace data and metadata references
    evaluatedExpr = evaluatedExpr.replace(/\bdata\.([a-zA-Z_][a-zA-Z0-9_.]*)/g, (match, prop) => {
      const value = this.getNestedProperty(context.data, prop);
      return JSON.stringify(value);
    });
    
    evaluatedExpr = evaluatedExpr.replace(/\bmetadata\.([a-zA-Z_][a-zA-Z0-9_.]*)/g, (match, prop) => {
      const value = this.getNestedProperty(context.metadata, prop);
      return JSON.stringify(value);
    });

    // Simple evaluation for basic comparisons
    // This is a basic implementation - extend as needed for more complex expressions
    try {
      // Only allow specific safe evaluation patterns
      const result = this.evaluateSimpleComparison(evaluatedExpr);
      return Boolean(result);
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${evaluatedExpr}`);
    }
  }

  /**
   * Get nested property safely
   */
  private static getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => {
      return current && typeof current === 'object' ? current[prop] : undefined;
    }, obj);
  }

  /**
   * Evaluate simple comparison expressions
   */
  private static evaluateSimpleComparison(expr: string): boolean {
    // Handle simple cases like: "success" === "success", true === true, etc.
    const comparisonMatch = expr.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
    
    if (comparisonMatch) {
      const [, left, operator, right] = comparisonMatch;
      const leftValue = this.parseValue(left.trim());
      const rightValue = this.parseValue(right.trim());
      
      switch (operator) {
        case '===': return leftValue === rightValue;
        case '!==': return leftValue !== rightValue;
        case '==': return leftValue == rightValue;
        case '!=': return leftValue != rightValue;
        case '>': return leftValue > rightValue;
        case '<': return leftValue < rightValue;
        case '>=': return leftValue >= rightValue;
        case '<=': return leftValue <= rightValue;
        default: return false;
      }
    }
    
    // Handle boolean values
    const value = this.parseValue(expr);
    return Boolean(value);
  }

  /**
   * Parse string value to appropriate type
   */
  private static parseValue(value: string): any {
    value = value.trim();
    
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;
    
    // Handle quoted strings
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // Handle numbers
    if (/^\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    return value;
  }
}

// =================== STEP IMPLEMENTATIONS ===================

/**
 * fetchWebsite: Fetch website content and metadata
 * Retrieves website content, extracts metadata, and performs basic analysis
 */
const fetchWebsiteSchema = z.object({
  url: z.string().url("Valid URL required"),
  timeout: z.number().min(1000).max(30000).optional().default(10000),
  followRedirects: z.boolean().optional().default(true),
  extractMetadata: z.boolean().optional().default(true)
});

async function fetchWebsiteStep(context: StepContext, config: z.infer<typeof fetchWebsiteSchema>): Promise<StepResult> {
  return safeExecute(context, 'fetchWebsite', async () => {
    context.logger?.info(`Fetching website: ${config.url}`, { runId: context.runId });

    // SECURITY: Validate URL against SSRF attacks
    const urlValidation = await URLSecurityValidator.validateURL(config.url);
    if (!urlValidation.isValid) {
      context.logger?.error(`SSRF protection blocked URL: ${config.url}`, { 
        runId: context.runId,
        error: urlValidation.error,
        hostname: urlValidation.hostname
      });
      throw new Error(`URL blocked for security reasons: ${urlValidation.error}`);
    }

    context.logger?.info(`URL validation passed for: ${urlValidation.hostname}`, { runId: context.runId });

    // Use fetch with timeout and proper headers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const response = await fetch(config.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadScanner/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: config.followRedirects ? 'follow' : 'manual'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      const contentType = response.headers.get('content-type') || '';
      
      // Extract basic metadata
      let metadata: Record<string, any> = {
        statusCode: response.status,
        contentType,
        contentLength: content.length,
        finalUrl: response.url,
        headers: Object.fromEntries(response.headers.entries())
      };

      if (config.extractMetadata) {
        // Extract title
        const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch) {
          metadata.title = titleMatch[1].trim();
        }

        // Extract meta description
        const descMatch = content.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
        if (descMatch) {
          metadata.description = descMatch[1].trim();
        }

        // Extract meta keywords
        const keywordsMatch = content.match(/<meta[^>]*name="keywords"[^>]*content="([^"]*)"[^>]*>/i);
        if (keywordsMatch) {
          metadata.keywords = keywordsMatch[1].trim().split(',').map(k => k.trim());
        }

        // Check for common technologies
        metadata.technologies = {
          hasWordPress: content.includes('wp-content') || content.includes('wordpress'),
          hasReact: content.includes('react') || content.includes('__REACT'),
          hasAngular: content.includes('ng-') || content.includes('angular'),
          hasVue: content.includes('vue') || content.includes('__vue'),
          hasBootstrap: content.includes('bootstrap'),
          hasGoogleAnalytics: content.includes('google-analytics') || content.includes('gtag'),
          hasGTM: content.includes('googletagmanager'),
          hasFacebook: content.includes('facebook.com') || content.includes('fbevents'),
          hasLinkedIn: content.includes('linkedin.com') || content.includes('_linkedin_partner_id')
        };
      }

      const outputs = {
        content,
        metadata,
        url: config.url,
        fetchedAt: new Date().toISOString()
      };

      context.logger?.info(`Successfully fetched website`, { 
        runId: context.runId, 
        contentLength: content.length,
        statusCode: response.status 
      });

      return {
        updates: { websiteContent: content, websiteMetadata: metadata },
        outputs
      };
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * seoScan: Perform SEO analysis on the website
 * Analyzes website content for SEO factors and technical issues
 */
const seoScanSchema = z.object({
  content: z.string().optional(),
  url: z.string().url().optional(),
  checkTechnical: z.boolean().optional().default(true),
  checkContent: z.boolean().optional().default(true)
});

async function seoScanStep(context: StepContext, config: z.infer<typeof seoScanSchema>): Promise<StepResult> {
  return safeExecute(context, 'seoScan', async () => {
    context.logger?.info(`Running SEO scan`, { runId: context.runId });

    const content = config.content || context.data.websiteContent;
    const metadata = context.data.websiteMetadata || {};

    if (!content) {
      throw new Error('No website content available for SEO scan');
    }

    const seoAnalysis: Record<string, any> = {
      score: 0,
      issues: [],
      recommendations: [],
      technicalSeo: {},
      contentSeo: {},
      scanDate: new Date().toISOString()
    };

    let totalChecks = 0;
    let passedChecks = 0;

    if (config.checkTechnical) {
      // Technical SEO checks
      const technical = seoAnalysis.technicalSeo;

      // Title tag check
      totalChecks++;
      if (metadata.title && metadata.title.length > 0) {
        passedChecks++;
        technical.hasTitle = true;
        if (metadata.title.length > 60) {
          seoAnalysis.issues.push('Title tag is too long (over 60 characters)');
          seoAnalysis.recommendations.push('Shorten title tag to under 60 characters');
        }
      } else {
        technical.hasTitle = false;
        seoAnalysis.issues.push('Missing title tag');
        seoAnalysis.recommendations.push('Add a descriptive title tag');
      }

      // Meta description check
      totalChecks++;
      if (metadata.description && metadata.description.length > 0) {
        passedChecks++;
        technical.hasDescription = true;
        if (metadata.description.length > 160) {
          seoAnalysis.issues.push('Meta description is too long (over 160 characters)');
          seoAnalysis.recommendations.push('Shorten meta description to under 160 characters');
        }
      } else {
        technical.hasDescription = false;
        seoAnalysis.issues.push('Missing meta description');
        seoAnalysis.recommendations.push('Add a compelling meta description');
      }

      // H1 tag check
      totalChecks++;
      const h1Matches = content.match(/<h1[^>]*>([^<]*)<\/h1>/gi);
      technical.h1Count = h1Matches ? h1Matches.length : 0;
      if (technical.h1Count === 1) {
        passedChecks++;
      } else if (technical.h1Count === 0) {
        seoAnalysis.issues.push('No H1 tag found');
        seoAnalysis.recommendations.push('Add exactly one H1 tag to the page');
      } else {
        seoAnalysis.issues.push(`Multiple H1 tags found (${technical.h1Count})`);
        seoAnalysis.recommendations.push('Use only one H1 tag per page');
      }

      // Image alt tags check
      totalChecks++;
      const imgMatches = content.match(/<img[^>]*>/gi) || [];
      const imagesWithoutAlt = imgMatches.filter((img: string) => !img.includes('alt='));
      technical.totalImages = imgMatches.length;
      technical.imagesWithoutAlt = imagesWithoutAlt.length;
      if (technical.imagesWithoutAlt === 0 && technical.totalImages > 0) {
        passedChecks++;
      } else if (technical.imagesWithoutAlt > 0) {
        seoAnalysis.issues.push(`${technical.imagesWithoutAlt} images missing alt attributes`);
        seoAnalysis.recommendations.push('Add descriptive alt text to all images');
      }

      // HTTPS check
      totalChecks++;
      const url = config.url || context.data.websiteMetadata?.finalUrl;
      if (url && url.startsWith('https://')) {
        passedChecks++;
        technical.hasHttps = true;
      } else {
        technical.hasHttps = false;
        seoAnalysis.issues.push('Website not using HTTPS');
        seoAnalysis.recommendations.push('Implement SSL certificate for HTTPS');
      }
    }

    if (config.checkContent) {
      // Content SEO checks
      const contentSeo = seoAnalysis.contentSeo;

      // Word count
      const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const wordCount = textContent.split(' ').filter((word: string) => word.length > 0).length;
      contentSeo.wordCount = wordCount;

      totalChecks++;
      if (wordCount >= 300) {
        passedChecks++;
      } else {
        seoAnalysis.issues.push(`Low word count (${wordCount} words)`);
        seoAnalysis.recommendations.push('Add more quality content (aim for 300+ words)');
      }

      // Heading structure
      const headings = {
        h1: (content.match(/<h1[^>]*>/gi) || []).length,
        h2: (content.match(/<h2[^>]*>/gi) || []).length,
        h3: (content.match(/<h3[^>]*>/gi) || []).length,
        h4: (content.match(/<h4[^>]*>/gi) || []).length,
        h5: (content.match(/<h5[^>]*>/gi) || []).length,
        h6: (content.match(/<h6[^>]*>/gi) || []).length
      };
      contentSeo.headingStructure = headings;

      totalChecks++;
      if (headings.h2 > 0) {
        passedChecks++;
      } else {
        seoAnalysis.issues.push('No H2 headings found');
        seoAnalysis.recommendations.push('Add H2 headings to structure your content');
      }
    }

    // Calculate overall score
    seoAnalysis.score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    const outputs = {
      seoAnalysis,
      score: seoAnalysis.score,
      issues: seoAnalysis.issues,
      recommendations: seoAnalysis.recommendations
    };

    context.logger?.info(`SEO scan completed`, { 
      runId: context.runId, 
      score: seoAnalysis.score,
      issuesFound: seoAnalysis.issues.length 
    });

    return {
      updates: { seoAnalysis },
      outputs
    };
  });
}

/**
 * emailEnrichment: Enrich lead with email information
 * Attempts to find and validate email addresses for the business
 */
const emailEnrichmentSchema = z.object({
  domain: z.string().optional(),
  businessName: z.string().optional(),
  searchPatterns: z.array(z.string()).optional().default(['info@', 'contact@', 'hello@', 'support@'])
});

async function emailEnrichmentStep(context: StepContext, config: z.infer<typeof emailEnrichmentSchema>): Promise<StepResult> {
  return safeExecute(context, 'emailEnrichment', async () => {
    context.logger?.info(`Running email enrichment`, { runId: context.runId });

    const domain = config.domain || context.data.websiteMetadata?.finalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const businessName = config.businessName || context.data.businessName;
    const websiteContent = context.data.websiteContent || '';

    if (!domain) {
      throw new Error('No domain available for email enrichment');
    }

    const enrichmentResult: Record<string, any> = {
      domain,
      businessName,
      foundEmails: [],
      suggestedEmails: [],
      extractedFromContent: [],
      enrichmentDate: new Date().toISOString()
    };

    // Extract emails from website content
    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const foundEmails = websiteContent.match(emailRegex) || [];
    
    // Filter and clean found emails
    const cleanEmails = Array.from(new Set(foundEmails as string[]))
      .filter((email: string) => {
        const emailDomain = email.split('@')[1];
        return emailDomain && emailDomain.toLowerCase().includes(domain.toLowerCase().split('.')[0]);
      })
      .filter((email: string) => !email.includes('example.') && !email.includes('test.') && !email.includes('demo.'));

    enrichmentResult.extractedFromContent = cleanEmails;

    // Generate suggested emails based on common patterns
    const domainParts = domain.split('.');
    const mainDomain = domainParts.slice(-2).join('.');
    
    for (const pattern of config.searchPatterns) {
      enrichmentResult.suggestedEmails.push(`${pattern}${mainDomain}`);
    }

    // If business name is available, create personalized suggestions
    if (businessName) {
      const cleanBusinessName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanBusinessName.length <= 10) {
        enrichmentResult.suggestedEmails.push(`${cleanBusinessName}@${mainDomain}`);
        enrichmentResult.suggestedEmails.push(`contact@${cleanBusinessName}.com`);
      }
    }

    // Combine and deduplicate all found emails
    enrichmentResult.foundEmails = Array.from(new Set([
      ...enrichmentResult.extractedFromContent,
      ...enrichmentResult.suggestedEmails.filter((email: string) => cleanEmails.includes(email))
    ]));

    const outputs = {
      enrichmentResult,
      foundEmails: enrichmentResult.foundEmails,
      domain: enrichmentResult.domain
    };

    context.logger?.info(`Email enrichment completed`, { 
      runId: context.runId, 
      foundEmails: enrichmentResult.foundEmails.length,
      suggestedEmails: enrichmentResult.suggestedEmails.length
    });

    return {
      updates: { emailEnrichment: enrichmentResult },
      outputs
    };
  });
}

/**
 * validateEmailDomain: Validate email domain using existing emailDomainFilter
 * Uses the existing domain classification utility to validate and classify emails
 */
const validateEmailDomainSchema = z.object({
  email: z.string().email().optional(),
  emails: z.array(z.string().email()).optional()
});

async function validateEmailDomainStep(context: StepContext, config: z.infer<typeof validateEmailDomainSchema>): Promise<StepResult> {
  return safeExecute(context, 'validateEmailDomain', async () => {
    context.logger?.info(`Validating email domains`, { runId: context.runId });

    const emailsToValidate: string[] = [];
    
    if (config.email) {
      emailsToValidate.push(config.email);
    }
    
    if (config.emails) {
      emailsToValidate.push(...config.emails);
    }

    // If no emails provided, try to get from context
    if (emailsToValidate.length === 0) {
      const contextEmail = context.data.email;
      const foundEmails = context.data.emailEnrichment?.foundEmails || [];
      
      if (contextEmail) emailsToValidate.push(contextEmail);
      if (foundEmails.length > 0) emailsToValidate.push(...foundEmails);
    }

    if (emailsToValidate.length === 0) {
      throw new Error('No emails provided for domain validation');
    }

    const validationResults = emailsToValidate.map(email => {
      try {
        const classification = classifyEmailDomain(email);
        const shouldFlag = shouldFlagLead(email);
        const reason = getFlaggingReason(email);

        return {
          email,
          domain: classification.domain,
          isPersonal: classification.isPersonal,
          isDisposable: classification.isDisposable,
          isBusiness: !classification.isPersonal && !classification.isDisposable,
          shouldFlag,
          flagReason: shouldFlag ? reason : null,
          isValid: true
        };
      } catch (error) {
        return {
          email,
          domain: null,
          isPersonal: false,
          isDisposable: false,
          isBusiness: false,
          shouldFlag: true,
          flagReason: 'Invalid email format',
          isValid: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const summary = {
      totalEmails: validationResults.length,
      validEmails: validationResults.filter(r => r.isValid).length,
      businessEmails: validationResults.filter(r => r.isBusiness).length,
      personalEmails: validationResults.filter(r => r.isPersonal).length,
      disposableEmails: validationResults.filter(r => r.isDisposable).length,
      flaggedEmails: validationResults.filter(r => r.shouldFlag).length,
      recommendedEmails: validationResults.filter(r => r.isBusiness && !r.shouldFlag)
    };

    const outputs = {
      validationResults,
      summary,
      recommendedEmail: summary.recommendedEmails.length > 0 ? validationResults.find(r => r.isBusiness && !r.shouldFlag)?.email : null
    };

    context.logger?.info(`Email domain validation completed`, { 
      runId: context.runId, 
      totalEmails: summary.totalEmails,
      businessEmails: summary.businessEmails,
      flaggedEmails: summary.flaggedEmails
    });

    return {
      updates: { emailValidation: { results: validationResults, summary } },
      outputs
    };
  });
}

/**
 * scoreBusiness: Calculate business score based on collected data
 * Analyzes all collected data to generate a comprehensive business score
 */
const scoreBusinessSchema = z.object({
  weights: z.object({
    seo: z.number().min(0).max(1).optional().default(0.25),
    email: z.number().min(0).max(1).optional().default(0.25),
    website: z.number().min(0).max(1).optional().default(0.25),
    technical: z.number().min(0).max(1).optional().default(0.25)
  }).optional().default({}),
  includeRecommendations: z.boolean().optional().default(true)
});

async function scoreBusinessStep(context: StepContext, config: z.infer<typeof scoreBusinessSchema>): Promise<StepResult> {
  return safeExecute(context, 'scoreBusiness', async () => {
    context.logger?.info(`Calculating business score`, { runId: context.runId });

    const weights = { ...{ seo: 0.25, email: 0.25, website: 0.25, technical: 0.25 }, ...config.weights };
    const seoAnalysis = context.data.seoAnalysis;
    const emailValidation = context.data.emailValidation;
    const websiteMetadata = context.data.websiteMetadata;
    const emailEnrichment = context.data.emailEnrichment;

    const scoring = {
      seoScore: 0,
      emailScore: 0,
      websiteScore: 0,
      technicalScore: 0,
      overallScore: 0,
      maxPossibleScore: 100,
      factors: {} as Record<string, any>,
      recommendations: [] as string[],
      strengths: [] as string[],
      weaknesses: [] as string[],
      scoringDate: new Date().toISOString()
    };

    // SEO Score (0-100)
    if (seoAnalysis) {
      scoring.seoScore = seoAnalysis.score || 0;
      scoring.factors.seo = {
        score: scoring.seoScore,
        issues: seoAnalysis.issues?.length || 0,
        recommendations: seoAnalysis.recommendations?.length || 0,
        hasTechnicalSeo: !!seoAnalysis.technicalSeo,
        hasContentSeo: !!seoAnalysis.contentSeo
      };

      if (scoring.seoScore >= 80) {
        scoring.strengths.push('Excellent SEO optimization');
      } else if (scoring.seoScore >= 60) {
        scoring.strengths.push('Good SEO foundation');
      } else {
        scoring.weaknesses.push('SEO needs improvement');
        if (config.includeRecommendations) {
          scoring.recommendations.push('Improve SEO by addressing technical and content issues');
        }
      }
    }

    // Email Score (0-100)
    if (emailValidation && emailEnrichment) {
      let emailScore = 0;
      const summary = emailValidation.summary;
      
      // Score based on business email availability and quality
      if (summary?.businessEmails && summary.businessEmails > 0) emailScore += 40;
      if (summary?.flaggedEmails === 0) emailScore += 30;
      if (emailEnrichment.foundEmails?.length && emailEnrichment.foundEmails.length > 0) emailScore += 20;
      if (summary?.validEmails && summary.validEmails > 1) emailScore += 10;

      scoring.emailScore = Math.min(emailScore, 100);
      scoring.factors.email = {
        score: scoring.emailScore,
        totalEmails: summary?.totalEmails || 0,
        businessEmails: summary?.businessEmails || 0,
        flaggedEmails: summary?.flaggedEmails || 0,
        foundEmails: emailEnrichment.foundEmails?.length || 0
      };

      if (scoring.emailScore >= 70) {
        scoring.strengths.push('Professional email setup');
      } else {
        scoring.weaknesses.push('Limited professional email presence');
        if (config.includeRecommendations) {
          scoring.recommendations.push('Set up professional business email addresses');
        }
      }
    }

    // Website Score (0-100)
    if (websiteMetadata) {
      let websiteScore = 0;
      
      // Basic functionality
      if (websiteMetadata.statusCode === 200) websiteScore += 25;
      if (websiteMetadata.hasHttps) websiteScore += 20;
      if (websiteMetadata.title) websiteScore += 15;
      if (websiteMetadata.description) websiteScore += 15;
      
      // Technologies and features
      const tech = websiteMetadata.technologies || {};
      const modernTech = tech.hasReact || tech.hasAngular || tech.hasVue;
      const analytics = tech.hasGoogleAnalytics || tech.hasGTM;
      const social = tech.hasFacebook || tech.hasLinkedIn;
      
      if (modernTech) websiteScore += 10;
      if (analytics) websiteScore += 10;
      if (social) websiteScore += 5;

      scoring.websiteScore = Math.min(websiteScore, 100);
      scoring.factors.website = {
        score: scoring.websiteScore,
        hasHttps: websiteMetadata.hasHttps,
        hasTitle: !!websiteMetadata.title,
        hasDescription: !!websiteMetadata.description,
        hasModernTech: modernTech,
        hasAnalytics: analytics,
        hasSocialIntegration: social
      };

      if (scoring.websiteScore >= 80) {
        scoring.strengths.push('Professional website with modern features');
      } else if (scoring.websiteScore >= 60) {
        scoring.strengths.push('Functional website');
      } else {
        scoring.weaknesses.push('Website needs technical improvements');
        if (config.includeRecommendations) {
          scoring.recommendations.push('Upgrade website with modern features and security');
        }
      }
    }

    // Technical Score (combination of various technical factors)
    let technicalScore = 0;
    let technicalFactors = 0;

    if (websiteMetadata?.hasHttps) { technicalScore += 25; technicalFactors++; }
    if (websiteMetadata?.contentType?.includes('text/html')) { technicalScore += 20; technicalFactors++; }
    if (websiteMetadata?.technologies?.hasGoogleAnalytics) { technicalScore += 15; technicalFactors++; }
    if (seoAnalysis?.technicalSeo?.hasTitle) { technicalScore += 20; technicalFactors++; }
    if (seoAnalysis?.technicalSeo?.hasDescription) { technicalScore += 20; technicalFactors++; }

    if (technicalFactors > 0) {
      scoring.technicalScore = Math.min(technicalScore / technicalFactors * 5, 100);
    }

    scoring.factors.technical = {
      score: scoring.technicalScore,
      factorsChecked: technicalFactors,
      hasHttps: websiteMetadata?.hasHttps || false,
      hasAnalytics: websiteMetadata?.technologies?.hasGoogleAnalytics || false,
      hasSeoBasics: !!(seoAnalysis?.technicalSeo?.hasTitle && seoAnalysis?.technicalSeo?.hasDescription)
    };

    // Calculate overall score
    scoring.overallScore = Math.round(
      (scoring.seoScore * weights.seo) +
      (scoring.emailScore * weights.email) +
      (scoring.websiteScore * weights.website) +
      (scoring.technicalScore * weights.technical)
    );

    // Add overall assessment
    if (scoring.overallScore >= 80) {
      scoring.strengths.push('Excellent overall digital presence');
    } else if (scoring.overallScore >= 60) {
      scoring.strengths.push('Good digital foundation');
    } else if (scoring.overallScore >= 40) {
      scoring.weaknesses.push('Digital presence needs improvement');
    } else {
      scoring.weaknesses.push('Significant digital presence gaps');
    }

    // Generate final recommendations
    if (config.includeRecommendations && scoring.overallScore < 70) {
      scoring.recommendations.push('Focus on improving the lowest-scoring areas first');
      
      const scores = [
        { name: 'SEO', score: scoring.seoScore },
        { name: 'Email', score: scoring.emailScore },
        { name: 'Website', score: scoring.websiteScore },
        { name: 'Technical', score: scoring.technicalScore }
      ];
      
      const lowest = scores.sort((a, b) => a.score - b.score)[0];
      if (lowest.score < 50) {
        scoring.recommendations.push(`Prioritize ${lowest.name.toLowerCase()} improvements for maximum impact`);
      }
    }

    const outputs = {
      scoring,
      overallScore: scoring.overallScore,
      strengths: scoring.strengths,
      weaknesses: scoring.weaknesses,
      recommendations: scoring.recommendations
    };

    context.logger?.info(`Business scoring completed`, { 
      runId: context.runId, 
      overallScore: scoring.overallScore,
      strengths: scoring.strengths.length,
      weaknesses: scoring.weaknesses.length
    });

    return {
      updates: { businessScoring: scoring },
      outputs
    };
  });
}

/**
 * finalizeScan: Write final scan results to scanResults.scanData
 * Aggregates all workflow data and saves it to the database
 */
const finalizeScanSchema = z.object({
  includeRawData: z.boolean().optional().default(false),
  status: z.enum(['completed', 'partial', 'failed']).optional().default('completed')
});

async function finalizeScanStep(context: StepContext, config: z.infer<typeof finalizeScanSchema>): Promise<StepResult> {
  return safeExecute(context, 'finalizeScan', async () => {
    context.logger?.info(`Finalizing scan results`, { runId: context.runId });

    if (!context.scanId) {
      throw new Error('No scan ID available for finalizing results');
    }

    // Aggregate all collected data
    const scanResults = {
      status: config.status,
      completedAt: new Date().toISOString(),
      runId: context.runId,
      
      // Core business information
      businessInfo: {
        name: context.data.businessName,
        website: context.data.websiteMetadata?.finalUrl || context.data.websiteUrl,
        email: context.data.emailValidation?.recommendedEmail || context.data.email,
        domain: context.data.websiteMetadata?.finalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      },

      // SEO Analysis Summary
      seo: {
        score: context.data.seoAnalysis?.score || 0,
        issues: context.data.seoAnalysis?.issues || [],
        recommendations: context.data.seoAnalysis?.recommendations || [],
        technicalSeo: context.data.seoAnalysis?.technicalSeo || {},
        contentSeo: context.data.seoAnalysis?.contentSeo || {}
      },

      // Email Analysis Summary
      email: {
        validation: context.data.emailValidation?.summary || {},
        enrichment: {
          foundEmails: context.data.emailEnrichment?.foundEmails || [],
          suggestedEmails: context.data.emailEnrichment?.suggestedEmails || []
        },
        recommendedEmail: context.data.emailValidation?.recommendedEmail
      },

      // Website Analysis Summary
      website: {
        metadata: {
          title: context.data.websiteMetadata?.title,
          description: context.data.websiteMetadata?.description,
          statusCode: context.data.websiteMetadata?.statusCode,
          hasHttps: context.data.websiteMetadata?.hasHttps,
          technologies: context.data.websiteMetadata?.technologies || {}
        },
        contentLength: context.data.websiteMetadata?.contentLength
      },

      // Business Scoring
      scoring: context.data.businessScoring || {
        overallScore: 0,
        seoScore: 0,
        emailScore: 0,
        websiteScore: 0,
        technicalScore: 0
      },

      // Recommendations and insights
      insights: {
        strengths: context.data.businessScoring?.strengths || [],
        weaknesses: context.data.businessScoring?.weaknesses || [],
        recommendations: context.data.businessScoring?.recommendations || []
      }
    };

    // Include raw data if requested
    if (config.includeRawData) {
      (scanResults as any).rawData = {
        websiteContent: context.data.websiteContent,
        fullSeoAnalysis: context.data.seoAnalysis,
        fullEmailValidation: context.data.emailValidation,
        fullEmailEnrichment: context.data.emailEnrichment,
        allContextData: context.data
      };
    }

    // Update scan result in database
    try {
      await context.storage.updateScanResult(context.scanId, {
        scanData: JSON.stringify(scanResults),
        status: config.status
      });

      context.logger?.info(`Scan results saved to database`, { 
        runId: context.runId,
        scanId: context.scanId,
        overallScore: scanResults.scoring.overallScore
      });
    } catch (error) {
      context.logger?.error(`Failed to save scan results to database`, { 
        runId: context.runId,
        scanId: context.scanId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to save scan results: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const outputs = {
      scanResults,
      scanId: context.scanId,
      finalStatus: config.status,
      savedAt: new Date().toISOString()
    };

    return {
      updates: { 
        finalScanResults: scanResults,
        scanStatus: config.status,
        completedAt: outputs.savedAt
      },
      outputs
    };
  });
}

/**
 * toolCall: Generic tool execution step using tool templates
 * Executes external tools by templateKey with safe interpolation and security validation
 */
const toolCallSchema = z.object({
  templateKey: z.string().min(1, "Template key is required"),
  overrides: z.record(z.any()).optional(),
  saveAs: z.string().optional(),
  responseMapping: z.record(z.any()).optional(),
});

async function toolCallStep(context: StepContext, config: z.infer<typeof toolCallSchema>): Promise<StepResult> {
  return safeExecute(context, 'toolCall', async () => {
    context.logger?.info(`Executing tool call`, { 
      runId: context.runId, 
      templateKey: config.templateKey,
      hasOverrides: !!config.overrides,
      saveAs: config.saveAs
    });

    // Get tool template from workflow definition in context
    // This assumes the workflow definition is available in context.data
    const workflowDefinition = context.data.workflowDefinition;
    if (!workflowDefinition?.tools?.templates) {
      throw new Error('No tool templates available in workflow definition');
    }

    const template = workflowDefinition.tools.templates.find(
      (t: ToolTemplate) => t.name === config.templateKey
    );

    if (!template) {
      throw new Error(`Tool template '${config.templateKey}' not found in workflow definition`);
    }

    // Start with template config and apply overrides
    let toolConfig = { ...template.config };
    if (config.overrides) {
      toolConfig = { ...toolConfig, ...config.overrides };
    }

    // Safe interpolation for ${data.foo} and ${metadata.*} placeholders
    toolConfig = interpolateConfigValues(toolConfig, context);

    context.logger?.info(`Tool template found`, {
      runId: context.runId,
      templateKey: config.templateKey,
      toolType: template.toolType,
      allowedDomains: template.allowedDomains?.length || 0
    });

    // Execute the tool
    const toolResult = await executeTool(
      template.toolType,
      toolConfig,
      context,
      template.allowedDomains
    );

    context.logger?.info(`Tool execution completed`, {
      runId: context.runId,
      templateKey: config.templateKey,
      success: toolResult.success,
      error: toolResult.error,
      hasData: !!toolResult.data,
      metadata: toolResult.metadata
    });

    // Prepare step outputs
    let outputs = {
      templateKey: config.templateKey,
      toolType: template.toolType,
      success: toolResult.success,
      data: toolResult.data,
      error: toolResult.error,
      metadata: toolResult.metadata,
      executedAt: new Date().toISOString()
    };

    // Apply response mapping if specified
    if (config.responseMapping && toolResult.data) {
      outputs = applyResponseMapping(outputs, config.responseMapping, toolResult.data);
    }

    // Prepare context updates
    let updates: Record<string, any> = {
      [`lastToolCall_${config.templateKey}`]: outputs
    };

    // Save result with saveAs key if specified
    if (config.saveAs && toolResult.success) {
      updates[config.saveAs] = toolResult.data;
    }

    return {
      updates,
      outputs
    };
  });
}

/**
 * Safe interpolation for configuration values
 * Replaces ${data.foo} and ${metadata.*} placeholders with actual values
 */
function interpolateConfigValues(config: any, context: StepContext): any {
  if (typeof config === 'string') {
    return interpolateString(config, context);
  } else if (Array.isArray(config)) {
    return config.map(item => interpolateConfigValues(item, context));
  } else if (config && typeof config === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = interpolateConfigValues(value, context);
    }
    return result;
  }
  return config;
}

/**
 * Interpolate string values with safe property access
 */
function interpolateString(str: string, context: StepContext): string {
  return str.replace(/\$\{(data|metadata)\.([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (match, source, path) => {
    try {
      const sourceObj = source === 'data' ? context.data : context.data.metadata || {};
      const value = getNestedProperty(sourceObj, path);
      return value !== undefined ? String(value) : match;
    } catch (error) {
      context.logger?.warn(`Failed to interpolate ${match}`, {
        runId: context.runId,
        source,
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return match; // Return original if interpolation fails
    }
  });
}

/**
 * Get nested property value safely
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, prop) => {
    return current && typeof current === 'object' ? current[prop] : undefined;
  }, obj);
}

/**
 * Apply response mapping to transform tool output
 */
function applyResponseMapping(outputs: any, mapping: Record<string, any>, data: any): any {
  const mappedOutputs = { ...outputs };
  
  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    if (typeof sourcePath === 'string') {
      const value = getNestedProperty(data, sourcePath);
      if (value !== undefined) {
        mappedOutputs[targetKey] = value;
      }
    }
  }
  
  return mappedOutputs;
}

/**
 * noop: No-operation step for testing and placeholders
 * Does nothing but can be useful for workflow testing and debugging
 */
const noopSchema = z.object({
  message: z.string().optional().default('No operation performed'),
  delay: z.number().min(0).max(5000).optional().default(0),
  outputData: z.record(z.any()).optional().default({})
});

async function noopStep(context: StepContext, config: z.infer<typeof noopSchema>): Promise<StepResult> {
  return safeExecute(context, 'noop', async () => {
    context.logger?.info(`Noop step: ${config.message}`, { runId: context.runId });

    // Add optional delay for testing timing
    if (config.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, config.delay));
    }

    const outputs = {
      message: config.message,
      timestamp: new Date().toISOString(),
      runId: context.runId,
      ...config.outputData
    };

    return {
      updates: { lastNoopStep: outputs },
      outputs
    };
  });
}

// =================== STEP REGISTRY ===================

/**
 * sendScanReport: Generate and send scan report to client while archiving to Google Drive
 * Handles dual delivery: email to client and upload to Google Drive
 */
const sendScanReportSchema = z.object({
  scanId: z.string().min(1, "Scan ID is required"),
  recipientEmail: z.string().email("Valid email address required"),
  reportTitle: z.string().optional().default("Business Analysis Report"),
  includeArchiving: z.boolean().optional().default(true),
  googleDriveFolderId: z.string().optional(),
  emailTemplate: z.string().optional().default("scan_report")
});

async function sendScanReportStep(context: StepContext, config: z.infer<typeof sendScanReportSchema>): Promise<StepResult> {
  return safeExecute(context, 'sendScanReport', async () => {
    context.logger?.info(`Starting scan report delivery`, { 
      runId: context.runId, 
      scanId: config.scanId,
      recipient: config.recipientEmail
    });

    // Get scan result and lead data
    const scanResult = await context.storage.getScanResult(config.scanId);
    if (!scanResult) {
      throw new Error(`Scan result not found: ${config.scanId}`);
    }

    const lead = scanResult.leadId ? await context.storage.getLead(scanResult.leadId) : null;
    
    context.logger?.info(`Retrieved scan data`, { 
      runId: context.runId,
      businessName: scanResult.businessName,
      hasLead: !!lead
    });

    // Generate professional report
    const generatedReport = await reportGenerator.generateReport(scanResult, lead || undefined);
    
    context.logger?.info(`Report generated successfully`, { 
      runId: context.runId,
      fileName: generatedReport.fileName,
      contentLength: generatedReport.htmlContent.length
    });

    const results = {
      emailSent: false,
      driveUploaded: false,
      driveFileId: null,
      driveUrl: null,
      errors: [] as string[]
    };

    // Execute Google Drive upload first (if archiving enabled) to get shareable URLs
    let driveUploadResult = null;
    if (config.includeArchiving) {
      try {
        // Execute Google Drive upload using the tool
        const driveResult = await executeTool(
          'googleDriveUpload',
          {
            fileName: generatedReport.fileName,
            content: generatedReport.htmlContent,
            mimeType: generatedReport.mimeType,
            folderId: config.googleDriveFolderId,
            description: `Business analysis report for ${scanResult.businessName} - Generated on ${new Date().toLocaleDateString()}`
          },
          context
        );

        if (driveResult.success) {
          driveUploadResult = driveResult.data;
          results.driveUploaded = true;
          results.driveFileId = driveResult.data?.fileId;
          results.driveUrl = driveResult.data?.webViewLink;
          
          context.logger?.info(`Google Drive upload successful`, { 
            runId: context.runId,
            fileId: results.driveFileId,
            fileName: generatedReport.fileName,
            webViewLink: driveResult.data?.webViewLink,
            downloadUrl: driveResult.data?.downloadUrl
          });
        } else {
          throw new Error(driveResult.error || 'Drive upload failed');
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Google Drive upload failed';
        results.errors.push(`Drive error: ${errorMessage}`);
        context.logger?.error(`Google Drive upload failed`, { 
          runId: context.runId,
          error: errorMessage,
          fileName: generatedReport.fileName
        });
      }
    }

    // Now send email with actual Drive URLs (or fallback URLs)
    try {
      // Get email template
      const template = await emailTemplateManager.getTemplate(config.emailTemplate);
      if (!template) {
        throw new Error(`Email template not found: ${config.emailTemplate}`);
      }

      // Prepare template variables with actual Google Drive URLs
      const reportUrl = driveUploadResult?.webViewLink || `${process.env.BASE_URL || 'https://yourapp.com'}/reports/${config.scanId}`;
      const downloadUrl = driveUploadResult?.downloadUrl || driveUploadResult?.webContentLink || `${process.env.BASE_URL || 'https://yourapp.com'}/reports/${config.scanId}/download`;
      
      const emailVariables = reportGenerator.generateEmailVariables(
        scanResult, 
        generatedReport,
        reportUrl,
        downloadUrl
      );

      // Add any additional lead-specific variables
      if (lead) {
        emailVariables.contactName = lead.contactName || emailVariables.businessName;
        emailVariables.leadName = lead.contactName || emailVariables.businessName;
      }

      // Render email template
      const { subject, body } = emailTemplateManager.renderTemplate(template, emailVariables);

      // Prepare email attachments - include HTML report as fallback if Drive upload failed
      const attachments = [];
      if (!results.driveUploaded) {
        attachments.push({
          filename: generatedReport.fileName,
          content: generatedReport.htmlContent,
          contentType: generatedReport.mimeType,
        });
      }

      // Send email
      const emailResult = await emailMailer.sendEmail({
        to: config.recipientEmail,
        from: emailMailer.getFromAddress(),
        subject,
        text: body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        html: body,
        attachments: attachments.length > 0 ? attachments : undefined
      });

      if (emailResult.success) {
        results.emailSent = true;
        context.logger?.info(`Email sent successfully`, { 
          runId: context.runId,
          messageId: emailResult.messageId,
          recipient: config.recipientEmail,
          reportUrl,
          downloadUrl,
          hasAttachment: attachments.length > 0
        });
      } else {
        throw new Error(emailResult.error || 'Email sending failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Email sending failed';
      results.errors.push(`Email error: ${errorMessage}`);
      context.logger?.error(`Email sending failed`, { 
        runId: context.runId,
        error: errorMessage,
        recipient: config.recipientEmail
      });
    }

    // Determine overall success
    const overallSuccess = results.emailSent && (!config.includeArchiving || results.driveUploaded);
    
    const outputs = {
      success: overallSuccess,
      emailSent: results.emailSent,
      driveUploaded: results.driveUploaded,
      driveFileId: results.driveFileId,
      driveUrl: results.driveUrl,
      reportFileName: generatedReport.fileName,
      reportSummary: generatedReport.summary,
      errors: results.errors,
      scanId: config.scanId,
      recipientEmail: config.recipientEmail
    };

    if (overallSuccess) {
      context.logger?.info(`Scan report delivery completed successfully`, { 
        runId: context.runId,
        scanId: config.scanId,
        emailSent: results.emailSent,
        driveUploaded: results.driveUploaded
      });
    } else {
      context.logger?.warn(`Scan report delivery completed with errors`, { 
        runId: context.runId,
        scanId: config.scanId,
        errors: results.errors
      });
    }

    return {
      updates: { 
        reportSent: overallSuccess,
        reportDeliveryResults: outputs
      },
      outputs
    };
  });
}

/**
 * Main step registry containing all available step types
 * Maps step type strings to their definitions (schema + run function)
 */
export const stepRegistry: IStepRegistry = {
  fetchWebsite: {
    configSchema: fetchWebsiteSchema,
    run: fetchWebsiteStep,
    description: 'Fetch website content and extract metadata for analysis'
  },

  seoScan: {
    configSchema: seoScanSchema,
    run: seoScanStep,
    description: 'Perform comprehensive SEO analysis on website content'
  },

  emailEnrichment: {
    configSchema: emailEnrichmentSchema,
    run: emailEnrichmentStep,
    description: 'Find and enrich business email information'
  },

  validateEmailDomain: {
    configSchema: validateEmailDomainSchema,
    run: validateEmailDomainStep,
    description: 'Validate and classify email domains using domain filters'
  },

  businessScoring: {
    configSchema: scoreBusinessSchema,
    run: scoreBusinessStep,
    description: 'Calculate comprehensive business score based on all collected data'
  },

  finalizeScan: {
    configSchema: finalizeScanSchema,
    run: finalizeScanStep,
    description: 'Finalize and save complete scan results to database'
  },

  toolCall: {
    configSchema: toolCallSchema,
    run: toolCallStep,
    description: 'Execute external tools by templateKey with safe interpolation and security validation'
  },

  sendScanReport: {
    configSchema: sendScanReportSchema,
    run: sendScanReportStep,
    description: 'Generate and send scan report to client while archiving to Google Drive'
  },

  noop: {
    configSchema: noopSchema,
    run: noopStep,
    description: 'No-operation step for testing and workflow placeholders'
  }
};

/**
 * Get a step definition by type
 * @param stepType - The type of step to retrieve
 * @returns The step definition or undefined if not found
 */
export function getStepDefinition(stepType: string): StepDefinition | undefined {
  return stepRegistry[stepType];
}

/**
 * Get all available step types
 * @returns Array of all registered step type names
 */
export function getAvailableStepTypes(): string[] {
  return Object.keys(stepRegistry);
}

/**
 * Validate a step configuration against its schema
 * @param stepType - The type of step
 * @param config - The configuration to validate
 * @returns Validation result with parsed config or error details
 */
export function validateStepConfig(stepType: string, config: any): { 
  success: boolean; 
  data?: any; 
  error?: string; 
} {
  const definition = getStepDefinition(stepType);
  if (!definition) {
    return { success: false, error: `Unknown step type: ${stepType}` };
  }

  try {
    const validatedConfig = definition.configSchema.parse(config);
    return { success: true, data: validatedConfig };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Validation failed';
    return { success: false, error: errorMessage };
  }
}

/**
 * Execute a step with the given context and configuration
 * @param stepType - The type of step to execute
 * @param context - The step execution context
 * @param config - The step configuration
 * @returns Promise resolving to step execution result
 */
export async function executeStep(
  stepType: string, 
  context: StepContext, 
  config: any
): Promise<StepResult> {
  const definition = getStepDefinition(stepType);
  if (!definition) {
    throw new Error(`Unknown step type: ${stepType}`);
  }

  // Validate configuration
  const validation = validateStepConfig(stepType, config);
  if (!validation.success) {
    throw new Error(`Invalid step configuration: ${validation.error}`);
  }

  // Execute the step
  return await definition.run(context, validation.data);
}

/**
 * Register a new step type in the registry
 * @param stepType - The unique identifier for the step type
 * @param definition - The step definition containing schema and run function
 */
export function registerStepType(stepType: string, definition: StepDefinition): void {
  if (stepRegistry[stepType]) {
    throw new Error(`Step type '${stepType}' is already registered`);
  }
  stepRegistry[stepType] = definition;
}

/**
 * Check if a step type is registered
 * @param stepType - The step type to check
 * @returns True if the step type exists in the registry
 */
export function isStepTypeRegistered(stepType: string): boolean {
  return stepType in stepRegistry;
}