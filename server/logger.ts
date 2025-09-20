import { config, isProduction } from "./config";

// Log levels for structured logging
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

// Structured log entry interface
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
  requestId?: string;
  userId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
}

// Logger class for structured logging
class Logger {
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = this.getLogLevel(config.LOG_LEVEL);
  }

  private getLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLog(entry: LogEntry): string {
    if (isProduction()) {
      // JSON format for production (easier for log aggregation)
      return JSON.stringify(entry);
    } else {
      // Human-readable format for development
      const timestamp = entry.timestamp;
      const level = entry.level.toUpperCase().padEnd(5);
      const prefix = entry.requestId ? `[${entry.requestId}] ` : '';
      
      let output = `${timestamp} ${level} ${prefix}${entry.message}`;
      
      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        output += `\n  Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
      }
      
      if (entry.error) {
        output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
        if (entry.error.stack && !isProduction()) {
          output += `\n  Stack: ${entry.error.stack}`;
        }
      }
      
      return output;
    }
  }

  private log(level: LogLevel, levelName: string, message: string, metadata?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      } : undefined,
    };

    // Add request context if available
    const asyncLocalStorage = (global as any).requestContext;
    if (asyncLocalStorage) {
      const context = asyncLocalStorage.getStore();
      if (context) {
        entry.requestId = context.requestId;
        entry.userId = context.userId;
      }
    }

    const formatted = this.formatLog(entry);
    
    // Output to appropriate stream
    if (level === LogLevel.ERROR) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }

    // In production, you could send logs to external service here
    // Example: await this.sendToLogService(entry);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, 'error', message, metadata, error);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, 'warn', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, 'info', message, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, 'debug', message, metadata);
  }

  // Request logging helpers
  request(method: string, url: string, statusCode: number, duration: number, metadata?: Record<string, any>): void {
    const logData = {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ...metadata,
    };

    if (statusCode >= 500) {
      this.error(`${method} ${url} - ${statusCode}`, undefined, logData);
    } else if (statusCode >= 400) {
      this.warn(`${method} ${url} - ${statusCode}`, logData);
    } else {
      this.info(`${method} ${url} - ${statusCode}`, logData);
    }
  }

  // Database operation logging
  database(operation: string, table: string, duration: number, error?: Error): void {
    const metadata = { operation, table, duration: `${duration}ms` };
    
    if (error) {
      this.error(`Database ${operation} failed on ${table}`, error, metadata);
    } else {
      this.debug(`Database ${operation} on ${table}`, metadata);
    }
  }

  // Security event logging
  security(event: string, metadata?: Record<string, any>): void {
    this.warn(`Security event: ${event}`, metadata);
  }
}

// Export singleton logger instance
export const logger = new Logger();

// Express middleware for request context and logging
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  userId?: string;
  startTime: number;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// Make context available globally for logger
(global as any).requestContext = asyncLocalStorage;

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  const context: RequestContext = {
    requestId,
    userId: (req as any).user?.id, // Assumes auth middleware sets req.user
    startTime,
  };

  asyncLocalStorage.run(context, () => {
    // Log request start
    logger.info('Request started', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
    });

    // Add request ID to response headers for correlation
    res.set('X-Request-Id', requestId);
    
    // Capture response details on finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.request(req.method, req.url, res.statusCode, duration, {
        requestId,
        contentLength: res.get('Content-Length'),
        userAgent: req.get('User-Agent'),
      });
    });

    next();
  });
}

// Data sanitization utility
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveKeys = ['password', 'token', 'auth', 'authorization', 'secret', 'key', 'email'];
  const sanitized: any = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sensitive => keyLower.includes(sensitive));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + '...[TRUNCATED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// Error handling middleware
export function errorLoggingMiddleware(error: Error, req: Request, res: Response, next: NextFunction): void {
  const context = asyncLocalStorage.getStore();
  const duration = context ? Date.now() - context.startTime : 0;
  
  // Determine appropriate status code
  const statusCode = (error as any).status || (error as any).statusCode || 500;
  
  // Sanitize request data for logging
  const sanitizedBody = req.body && Object.keys(req.body).length > 0 ? sanitizeData(req.body) : undefined;
  const sanitizedQuery = req.query && Object.keys(req.query).length > 0 ? sanitizeData(req.query) : undefined;
  
  // Log the error with full context
  logger.error('Request error', error, {
    method: req.method,
    url: req.url,
    statusCode,
    duration: `${duration}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    body: sanitizedBody,
    query: sanitizedQuery,
  });

  // Add request ID to response headers for correlation
  if (context?.requestId) {
    res.set('X-Request-Id', context.requestId);
  }

  // Don't expose internal errors in production
  if (isProduction()) {
    res.status(statusCode >= 500 ? 500 : statusCode).json({
      error: statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
      message: statusCode >= 500 ? 'An unexpected error occurred. Please try again later.' : error.message,
      timestamp: new Date().toISOString(),
      requestId: context?.requestId,
    });
  } else {
    res.status(statusCode).json({
      error: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      requestId: context?.requestId,
    });
  }
}

// Health check and monitoring helpers
export function logHealthCheck(component: string, status: 'healthy' | 'unhealthy', details?: Record<string, any>): void {
  if (status === 'healthy') {
    logger.info(`Health check: ${component}`, { status, ...details });
  } else {
    logger.error(`Health check failed: ${component}`, undefined, { status, ...details });
  }
}

// Application startup logging
export function logApplicationStart(): void {
  logger.info('Application starting', {
    name: config.APP_NAME,
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
    port: config.PORT,
    host: config.HOST,
  });
}

export function logApplicationReady(): void {
  logger.info('Application ready to serve requests', {
    name: config.APP_NAME,
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  });
}