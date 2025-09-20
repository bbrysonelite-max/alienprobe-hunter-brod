/**
 * Tool Registry System for Workflow Tool Integration
 * 
 * This module provides a comprehensive tool registry that supports:
 * - Global in-memory registry mapping toolType to configuration schema and execution function
 * - Built-in tool types: httpRequest, webhook, emailSend, aiGenerate
 * - Security validation for HTTP requests using URLSecurityValidator
 * - Environment-variable-based authentication
 * - Secret redaction in logs
 */

import { z } from "zod";
import { URLSecurityValidator } from "./steps";
import { emailMailer } from "../email/mailer";
import OpenAI from "openai";
import { logger } from "../logger";
import type { StepContext } from "./steps";
import type { ToolTemplate } from "@shared/schema";

// =================== TOOL INTERFACES ===================

/**
 * Tool definition interface
 */
export interface ToolDefinition<TConfig = any> {
  /** Zod schema for validating tool configuration */
  configSchema: z.ZodSchema<TConfig>;
  /** Function to execute the tool */
  run: (context: StepContext, config: TConfig) => Promise<ToolResult>;
  /** Tool description */
  description?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Tool output data */
  data?: any;
  /** Error message if tool failed */
  error?: string;
  /** Response metadata */
  metadata?: {
    duration?: number;
    statusCode?: number;
    headers?: Record<string, string>;
    url?: string;
    method?: string;
  };
}

// Tool template definition is imported from shared schema to avoid duplication

// =================== CONFIGURATION SCHEMAS ===================

/**
 * HTTP Request tool configuration schema
 */
export const httpRequestConfigSchema = z.object({
  url: z.string().url("Valid URL required"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  timeout: z.number().min(1000).max(30000).default(10000),
  maxSize: z.number().min(1024).max(10485760).default(1048576), // 1MB default, 10MB max
  retries: z.number().min(0).max(3).default(1),
  allowRedirects: z.boolean().default(true),
  validateSSL: z.boolean().default(true),
});

export type HttpRequestConfig = z.infer<typeof httpRequestConfigSchema>;

/**
 * Webhook tool configuration schema
 */
export const webhookConfigSchema = z.object({
  url: z.string().url("Valid webhook URL required"),
  payload: z.any(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).default(10000),
  retries: z.number().min(0).max(3).default(2),
  validateSSL: z.boolean().default(true),
});

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

/**
 * Email Send tool configuration schema
 */
export const emailSendConfigSchema = z.object({
  to: z.string().email("Valid email address required"),
  subject: z.string().min(1, "Subject is required"),
  text: z.string().min(1, "Text content is required"),
  html: z.string().optional(),
  from: z.string().email("Valid from email required").optional(),
});

export type EmailSendConfig = z.infer<typeof emailSendConfigSchema>;

/**
 * AI Generate tool configuration schema
 */
export const aiGenerateConfigSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  model: z.string().default("gpt-4o-mini"),
  maxTokens: z.number().min(1).max(4000).default(1000),
  temperature: z.number().min(0).max(2).default(0.7),
  systemPrompt: z.string().optional(),
});

export type AiGenerateConfig = z.infer<typeof aiGenerateConfigSchema>;

/**
 * Google Drive Upload tool configuration schema
 */
export const googleDriveUploadConfigSchema = z.object({
  fileName: z.string().min(1, "File name is required").refine(
    (name) => !/[<>:"/\\|?*]/.test(name),
    "File name contains invalid characters"
  ),
  content: z.string().min(1, "Content is required").refine(
    (content) => content.length <= 10 * 1024 * 1024, // 10MB limit
    "Content size exceeds 10MB limit"
  ),
  folderId: z.string().optional(),
  mimeType: z.string().default("text/plain"),
  description: z.string().optional(),
});

export type GoogleDriveUploadConfig = z.infer<typeof googleDriveUploadConfigSchema>;

// =================== UTILITY FUNCTIONS ===================

/**
 * Redact sensitive information from logs
 */
function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted = { ...obj };
  const sensitiveKeys = ['authorization', 'api-key', 'x-api-key', 'token', 'password', 'secret'];

  for (const [key, value] of Object.entries(redacted)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    }
  }

  return redacted;
}

/**
 * Create secure HTTP headers with authentication from environment variables
 */
function createSecureHeaders(baseHeaders: Record<string, string> = {}, authEnvVar?: string): Record<string, string> {
  const headers = { ...baseHeaders };
  
  // Add authentication from environment variable if specified
  if (authEnvVar && process.env[authEnvVar]) {
    headers.Authorization = `Bearer ${process.env[authEnvVar]}`;
  }

  // Add standard security headers
  headers['User-Agent'] = 'AlienProbe-Workflow/1.0';
  
  return headers;
}

/**
 * Safe HTTP fetch with security validation and timeout
 */
async function secureHttpRequest(config: HttpRequestConfig, allowedDomains?: string[]): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    // Validate URL security
    const urlValidation = await URLSecurityValidator.validateURL(config.url);
    if (!urlValidation.isValid) {
      return {
        success: false,
        error: `URL security validation failed: ${urlValidation.error}`,
      };
    }

    // Check domain allowlist if provided
    if (allowedDomains && allowedDomains.length > 0 && urlValidation.hostname) {
      const isAllowed = allowedDomains.some(domain => 
        urlValidation.hostname === domain || 
        urlValidation.hostname!.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return {
          success: false,
          error: `Domain ${urlValidation.hostname} not in allowlist: ${allowedDomains.join(', ')}`,
        };
      }
    }

    // Prepare request options with secure headers
    const secureHeaders = createSecureHeaders(config.headers || {});
    const fetchOptions: RequestInit = {
      method: config.method,
      headers: secureHeaders,
      redirect: config.allowRedirects ? 'follow' : 'manual',
      signal: AbortSignal.timeout(config.timeout),
    };

    // Add body for non-GET requests
    if (config.method !== 'GET' && config.body !== undefined) {
      if (typeof config.body === 'object' && config.body !== null) {
        fetchOptions.body = JSON.stringify(config.body);
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
      } else {
        fetchOptions.body = String(config.body);
      }
    }

    let response: Response;
    let retryCount = 0;

    // Retry logic
    while (retryCount <= config.retries) {
      try {
        response = await fetch(config.url, fetchOptions);
        break;
      } catch (error) {
        retryCount++;
        if (retryCount > config.retries) {
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    // Check response size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > config.maxSize) {
      return {
        success: false,
        error: `Response size ${contentLength} exceeds maximum allowed size ${config.maxSize}`,
      };
    }

    // Parse response
    let responseData: any;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const text = await response.text();
      if (text.length > config.maxSize) {
        return {
          success: false,
          error: `Response size ${text.length} exceeds maximum allowed size ${config.maxSize}`,
        };
      }
      responseData = JSON.parse(text);
    } else {
      const text = await response.text();
      if (text.length > config.maxSize) {
        return {
          success: false,
          error: `Response size ${text.length} exceeds maximum allowed size ${config.maxSize}`,
        };
      }
      responseData = text;
    }

    const duration = Date.now() - startTime;

    return {
      success: response.ok,
      data: responseData,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      metadata: {
        duration,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        url: config.url,
        method: config.method,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown HTTP error',
      metadata: {
        duration,
        url: config.url,
        method: config.method,
      },
    };
  }
}

// =================== TOOL IMPLEMENTATIONS ===================

/**
 * HTTP Request Tool
 */
const httpRequestTool: ToolDefinition<HttpRequestConfig> = {
  configSchema: httpRequestConfigSchema,
  description: "Make HTTP requests to external APIs with security validation",
  
  async run(context: StepContext, config: HttpRequestConfig): Promise<ToolResult> {
    context.logger.info("Executing HTTP request tool", {
      runId: context.runId,
      method: config.method,
      url: redactSensitiveData({ url: config.url }),
      headers: redactSensitiveData(config.headers),
    });

    const result = await secureHttpRequest(config);

    context.logger.info("HTTP request completed", {
      runId: context.runId,
      success: result.success,
      statusCode: result.metadata?.statusCode,
      duration: result.metadata?.duration,
      error: result.error,
    });

    return result;
  },
};

/**
 * Webhook Tool
 */
const webhookTool: ToolDefinition<WebhookConfig> = {
  configSchema: webhookConfigSchema,
  description: "Send POST requests to webhook endpoints",
  
  async run(context: StepContext, config: WebhookConfig): Promise<ToolResult> {
    context.logger.info("Executing webhook tool", {
      runId: context.runId,
      url: redactSensitiveData({ url: config.url }),
      headers: redactSensitiveData(config.headers),
    });

    // Convert webhook config to HTTP request config
    const httpConfig: HttpRequestConfig = {
      url: config.url,
      method: "POST",
      headers: config.headers,
      body: config.payload,
      timeout: config.timeout,
      retries: config.retries,
      validateSSL: config.validateSSL,
      maxSize: 1048576, // 1MB for webhook responses
      allowRedirects: true,
    };

    const result = await secureHttpRequest(httpConfig);

    context.logger.info("Webhook completed", {
      runId: context.runId,
      success: result.success,
      statusCode: result.metadata?.statusCode,
      duration: result.metadata?.duration,
      error: result.error,
    });

    return result;
  },
};

/**
 * Email Send Tool
 */
const emailSendTool: ToolDefinition<EmailSendConfig> = {
  configSchema: emailSendConfigSchema,
  description: "Send emails using the configured email provider",
  
  async run(context: StepContext, config: EmailSendConfig): Promise<ToolResult> {
    context.logger.info("Executing email send tool", {
      runId: context.runId,
      to: config.to,
      subject: config.subject,
      from: config.from,
      textLength: config.text.length,
      hasHtml: !!config.html,
    });

    try {
      const fromAddress = config.from || emailMailer.getFromAddress();
      
      const emailResult = await emailMailer.sendEmail({
        to: config.to,
        from: fromAddress,
        subject: config.subject,
        text: config.text,
        html: config.html || config.text,
      });

      context.logger.info("Email send completed", {
        runId: context.runId,
        success: emailResult.success,
        messageId: emailResult.messageId,
        error: emailResult.error,
      });

      return {
        success: emailResult.success,
        data: {
          messageId: emailResult.messageId,
          to: config.to,
          subject: config.subject,
        },
        error: emailResult.error,
        metadata: {
          provider: emailMailer.isConfigured() ? 'sendgrid' : 'mock',
          messageId: emailResult.messageId,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
      
      context.logger.error("Email send failed", {
        runId: context.runId,
        error: errorMessage,
        to: config.to,
        subject: config.subject,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

/**
 * AI Generate Tool
 */
const aiGenerateTool: ToolDefinition<AiGenerateConfig> = {
  configSchema: aiGenerateConfigSchema,
  description: "Generate content using OpenAI",
  
  async run(context: StepContext, config: AiGenerateConfig): Promise<ToolResult> {
    context.logger.info("Executing AI generate tool", {
      runId: context.runId,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      promptLength: config.prompt.length,
      hasSystemPrompt: !!config.systemPrompt,
    });

    try {
      // Initialize OpenAI client
      const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY 
      }) : null;

      if (!openai) {
        context.logger.warn("OpenAI API key not configured - using mock AI response", {
          runId: context.runId,
        });
        
        return {
          success: true,
          data: {
            text: `Mock AI response for prompt: "${config.prompt.substring(0, 100)}..."`,
            model: config.model,
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          },
          metadata: {
            provider: 'mock',
            model: config.model,
          },
        };
      }

      // Prepare messages
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      
      if (config.systemPrompt) {
        messages.push({ role: 'system', content: config.systemPrompt });
      }
      
      messages.push({ role: 'user', content: config.prompt });

      // Make OpenAI API call
      const startTime = Date.now();
      const completion = await openai.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      });

      const duration = Date.now() - startTime;
      const generatedText = completion.choices[0]?.message?.content || '';

      context.logger.info("AI generate completed", {
        runId: context.runId,
        success: true,
        model: config.model,
        tokensUsed: completion.usage?.total_tokens,
        duration,
        responseLength: generatedText.length,
      });

      return {
        success: true,
        data: {
          text: generatedText,
          model: config.model,
          usage: completion.usage,
        },
        metadata: {
          provider: 'openai',
          model: config.model,
          duration,
          tokensUsed: completion.usage?.total_tokens,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown AI error';
      
      context.logger.error("AI generate failed", {
        runId: context.runId,
        error: errorMessage,
        model: config.model,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

/**
 * Google Drive Upload Tool
 */
const googleDriveUploadTool: ToolDefinition<GoogleDriveUploadConfig> = {
  configSchema: googleDriveUploadConfigSchema,
  description: "Upload files to Google Drive with security validation",
  
  async run(context: StepContext, config: GoogleDriveUploadConfig): Promise<ToolResult> {
    context.logger.info("Executing Google Drive upload tool", {
      runId: context.runId,
      fileName: config.fileName,
      contentSize: config.content.length,
      mimeType: config.mimeType,
      folderId: config.folderId,
    });

    const startTime = Date.now();

    try {
      // Check if API key is configured
      const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      if (!apiKey) {
        context.logger.warn("Google Drive API key not configured - using mock upload", {
          runId: context.runId,
        });
        
        const mockFileId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return {
          success: true,
          data: {
            fileId: mockFileId,
            fileName: config.fileName,
            mimeType: config.mimeType,
            size: config.content.length,
            webViewLink: `https://drive.google.com/file/d/${mockFileId}/view`,
            downloadUrl: `https://drive.google.com/uc?id=${mockFileId}`,
          },
          metadata: {
            provider: 'mock',
            duration: Date.now() - startTime,
            folderId: config.folderId,
          },
        };
      }

      // Sanitize filename for security
      const sanitizedFileName = config.fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      if (!sanitizedFileName) {
        return {
          success: false,
          error: "Invalid file name after sanitization",
        };
      }

      // Use default folder from environment if not specified
      const folderId = config.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
      
      // Create multipart upload payload
      const boundary = `-------${Date.now()}`;
      const metadata = {
        name: sanitizedFileName,
        ...(config.description && { description: config.description }),
        ...(folderId && { parents: [folderId] }),
      };

      const multipartBody = [
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${config.mimeType}`,
        '',
        config.content,
        `--${boundary}--`
      ].join('\r\n');

      // Make Google Drive API call
      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': multipartBody.length.toString(),
        },
        body: multipartBody,
      });

      if (!response.ok) {
        const errorText = await response.text();
        context.logger.error("Google Drive upload failed", {
          runId: context.runId,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        return {
          success: false,
          error: `Google Drive upload failed: ${response.status} ${response.statusText}`,
        };
      }

      const uploadResult = await response.json();
      const duration = Date.now() - startTime;

      context.logger.info("Google Drive upload completed", {
        runId: context.runId,
        success: true,
        fileId: uploadResult.id,
        fileName: uploadResult.name,
        size: config.content.length,
        duration,
      });

      return {
        success: true,
        data: {
          fileId: uploadResult.id,
          fileName: uploadResult.name,
          mimeType: uploadResult.mimeType || config.mimeType,
          size: config.content.length,
          webViewLink: `https://drive.google.com/file/d/${uploadResult.id}/view`,
          downloadUrl: `https://drive.google.com/uc?id=${uploadResult.id}`,
          createdTime: uploadResult.createdTime,
        },
        metadata: {
          provider: 'google-drive',
          duration,
          folderId: folderId,
          apiVersion: 'v3',
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown Google Drive error';
      
      context.logger.error("Google Drive upload failed", {
        runId: context.runId,
        error: errorMessage,
        fileName: config.fileName,
        duration,
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: 'google-drive',
          duration,
        },
      };
    }
  },
};

// =================== TOOL REGISTRY ===================

/**
 * Global tool registry mapping tool types to their definitions
 */
export const toolRegistry = new Map<string, ToolDefinition>([
  ['httpRequest', httpRequestTool],
  ['webhook', webhookTool],
  ['emailSend', emailSendTool],
  ['aiGenerate', aiGenerateTool],
  ['googleDriveUpload', googleDriveUploadTool],
]);

/**
 * Register a new tool type
 */
export function registerTool<TConfig>(toolType: string, definition: ToolDefinition<TConfig>): void {
  toolRegistry.set(toolType, definition);
  logger.info(`Registered tool type: ${toolType}`, { toolType, description: definition.description });
}

/**
 * Get a tool definition by type
 */
export function getTool(toolType: string): ToolDefinition | undefined {
  return toolRegistry.get(toolType);
}

/**
 * Get all available tool types
 */
export function getAvailableToolTypes(): string[] {
  return Array.from(toolRegistry.keys());
}

/**
 * Validate tool configuration against its schema
 */
export function validateToolConfig(toolType: string, config: any): { valid: boolean; error?: string; data?: any } {
  const tool = getTool(toolType);
  if (!tool) {
    return { valid: false, error: `Unknown tool type: ${toolType}` };
  }

  try {
    const validatedConfig = tool.configSchema.parse(config);
    return { valid: true, data: validatedConfig };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid configuration'
    };
  }
}

/**
 * Execute a tool with given configuration
 */
export async function executeTool(
  toolType: string, 
  config: any, 
  context: StepContext, 
  allowedDomains?: string[]
): Promise<ToolResult> {
  const tool = getTool(toolType);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool type: ${toolType}`,
    };
  }

  // Validate configuration
  const validation = validateToolConfig(toolType, config);
  if (!validation.valid) {
    return {
      success: false,
      error: `Configuration validation failed: ${validation.error}`,
    };
  }

  // Execute tool with proper allowedDomains handling for HTTP-based tools
  if ((toolType === 'httpRequest' || toolType === 'webhook') && allowedDomains) {
    // Pass allowedDomains to secureHttpRequest function
    const result = await secureHttpRequest(validation.data, allowedDomains);
    context.logger.info("Tool execution completed with domain allowlist", {
      runId: context.runId,
      toolType,
      success: result.success,
      allowedDomains: redactSensitiveData(allowedDomains),
      error: result.error,
    });
    return result;
  }

  return await tool.run(context, validation.data);
}