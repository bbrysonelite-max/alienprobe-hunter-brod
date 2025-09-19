import { migrator } from './migrations';
import { seeder } from './seeder';
import { logger } from '../logger';
import { config, isProduction } from '../config';

// Database initialization for application startup
export class DatabaseInitializer {
  
  // Initialize database for application startup
  async initializeForStartup(): Promise<boolean> {
    try {
      logger.info('Initializing database for application startup');
      
      // Validate database connection
      const isConnected = await migrator.validateConnection();
      if (!isConnected) {
        logger.error('Database connection failed during startup');
        return false;
      }
      
      // Run migrations automatically
      const migrationSuccess = await migrator.runMigrations();
      if (!migrationSuccess) {
        logger.error('Database migrations failed during startup');
        return false;
      }
      
      // Verify schema after migrations
      const schemaValid = await migrator.verifySchema();
      if (!schemaValid) {
        logger.error('Database schema validation failed after migrations');
        return false;
      }
      
      // Seed data if database is empty (development only)
      if (!isProduction()) {
        const isEmpty = await seeder.isDatabaseEmpty();
        if (isEmpty) {
          logger.info('Database is empty, seeding development data');
          await seeder.seedDevelopmentData();
        }
      }
      
      // Log database statistics
      const stats = await seeder.getDatabaseStats();
      logger.info('Database initialization completed', {
        users: stats.users,
        scanResults: stats.scanResults,
        environment: config.NODE_ENV,
      });
      
      return true;
    } catch (error) {
      logger.error('Database initialization failed', error as Error);
      return false;
    }
  }
  
  // Health check for monitoring endpoints
  async getHealthStatus(): Promise<{
    healthy: boolean;
    details: {
      connected: boolean;
      schemaValid: boolean;
      hasData: boolean;
      responseTime: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      const connected = await migrator.validateConnection();
      const schemaValid = connected ? await migrator.verifySchema() : false;
      
      let hasData = false;
      if (connected && schemaValid) {
        const stats = await seeder.getDatabaseStats();
        hasData = stats.users > 0 || stats.scanResults > 0;
      }
      
      const responseTime = Date.now() - startTime;
      const healthy = connected && schemaValid;
      
      return {
        healthy,
        details: {
          connected,
          schemaValid,
          hasData,
          responseTime,
        },
      };
    } catch (error) {
      logger.error('Database health check failed', error as Error);
      return {
        healthy: false,
        details: {
          connected: false,
          schemaValid: false,
          hasData: false,
          responseTime: Date.now() - startTime,
        },
      };
    }
  }
  
  // Quick connection test for simple health checks
  async isConnected(): Promise<boolean> {
    try {
      return await migrator.validateConnection();
    } catch (error) {
      logger.error('Database connection test failed', error as Error);
      return false;
    }
  }
}

// Singleton instance for the application
export const dbInitializer = new DatabaseInitializer();