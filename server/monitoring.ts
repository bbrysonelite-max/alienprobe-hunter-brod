import { Request, Response, NextFunction } from 'express';
import { logger, logHealthCheck } from './logger';
import { config } from './config';
import { db } from './db';
import { dbInitializer } from './database/init';
import os from 'os';

// Health check status interface
interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    memory: {
      status: 'healthy' | 'unhealthy';
      usage: {
        total: number;
        used: number;
        percentage: number;
      };
    };
    disk: {
      status: 'healthy' | 'unhealthy';
      available: number;
    };
  };
}

// Database health check using the database initializer
async function checkDatabase(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string; details?: any }> {
  try {
    const healthStatus = await dbInitializer.getHealthStatus();
    
    logHealthCheck('database', healthStatus.healthy ? 'healthy' : 'unhealthy', {
      responseTime: `${healthStatus.details.responseTime}ms`,
      connected: healthStatus.details.connected,
      schemaValid: healthStatus.details.schemaValid,
      hasData: healthStatus.details.hasData,
    });
    
    return {
      status: healthStatus.healthy ? 'healthy' : 'unhealthy',
      responseTime: healthStatus.details.responseTime,
      details: healthStatus.details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    logHealthCheck('database', 'unhealthy', { error: errorMessage });
    
    return {
      status: 'unhealthy',
      error: errorMessage,
    };
  }
}

// Memory health check
function checkMemory(): { status: 'healthy' | 'unhealthy'; usage: { total: number; used: number; percentage: number } } {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const percentage = (usedMemory / totalMemory) * 100;
  
  const usage = {
    total: Math.round(totalMemory / 1024 / 1024), // MB
    used: Math.round(usedMemory / 1024 / 1024), // MB
    percentage: Math.round(percentage * 100) / 100,
  };
  
  // Consider unhealthy if memory usage > 90%
  const status = percentage > 90 ? 'unhealthy' : 'healthy';
  
  logHealthCheck('memory', status, usage);
  
  return { status, usage };
}

// Disk health check (simplified)
function checkDisk(): { status: 'healthy' | 'unhealthy'; available: number } {
  try {
    // In a real scenario, you'd check actual disk space
    // For now, we'll just return a healthy status
    const available = 85; // Percentage
    const status = available > 10 ? 'healthy' : 'unhealthy';
    
    logHealthCheck('disk', status, { available: `${available}%` });
    
    return { status, available };
  } catch (error) {
    logHealthCheck('disk', 'unhealthy', { error: 'Failed to check disk space' });
    return { status: 'unhealthy', available: 0 };
  }
}

// Comprehensive health check endpoint
export async function healthCheck(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Run all health checks
    const [databaseCheck, memoryCheck, diskCheck] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkMemory()),
      Promise.resolve(checkDisk()),
    ]);
    
    // Determine overall status
    const allChecks = [databaseCheck.status, memoryCheck.status, diskCheck.status];
    const overallStatus = allChecks.every(status => status === 'healthy') ? 'healthy' : 'unhealthy';
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
      uptime: Math.round(process.uptime()),
      checks: {
        database: databaseCheck,
        memory: memoryCheck,
        disk: diskCheck,
      },
    };
    
    const responseTime = Date.now() - startTime;
    
    // Log health check completion
    logger.info('Health check completed', {
      status: overallStatus,
      responseTime: `${responseTime}ms`,
      checks: {
        database: databaseCheck.status,
        memory: memoryCheck.status,
        disk: diskCheck.status,
      },
    });
    
    // Return appropriate HTTP status
    const httpStatus = overallStatus === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
    
  } catch (error) {
    logger.error('Health check failed', error as Error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
    });
  }
}

// Simple liveness probe for container orchestration
export function livenessProbe(req: Request, res: Response): void {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
}

// Readiness probe for container orchestration
export async function readinessProbe(req: Request, res: Response): Promise<void> {
  try {
    // Use the database initializer for a more comprehensive readiness check
    const isConnected = await dbInitializer.isConnected();
    
    if (isConnected) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        database: 'connected',
        version: config.APP_VERSION,
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: 'Database connection failed',
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
}

// Application metrics endpoint (optional)
export function metricsEndpoint(req: Request, res: Response): void {
  if (!config.ENABLE_METRICS) {
    res.status(404).json({ error: 'Metrics endpoint is disabled' });
    return;
  }
  
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
    nodejs: process.version,
    platform: os.platform(),
    architecture: os.arch(),
  };
  
  logger.debug('Metrics requested', metrics);
  res.json(metrics);
}

// Error simulation endpoint for testing (development only)
export function simulateError(req: Request, res: Response, next: NextFunction): void {
  if (config.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  
  const errorType = req.query.type as string || 'generic';
  
  logger.warn('Simulating error for testing', { errorType });
  
  try {
    switch (errorType) {
      case 'database':
        const dbError = new Error('Simulated database connection error');
        (dbError as any).status = 503;
        throw dbError;
      case 'memory':
        const memError = new Error('Simulated out of memory error');
        (memError as any).status = 503;
        throw memError;
      case 'timeout':
        // Use Promise.reject to avoid unhandled exceptions in setTimeout
        Promise.reject(new Error('Simulated timeout error')).catch(next);
        return;
      case 'auth':
        const authError = new Error('Simulated authentication error');
        (authError as any).status = 401;
        throw authError;
      case 'validation':
        const validationError = new Error('Simulated validation error');
        (validationError as any).status = 400;
        throw validationError;
      default:
        throw new Error('Simulated generic error for testing');
    }
  } catch (error) {
    next(error);
  }
}