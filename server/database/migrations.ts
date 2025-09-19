import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { logger } from '../logger';
import { config } from '../config';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';

// Migration utilities for automated database setup
export class DatabaseMigrator {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;
  
  constructor(connectionString?: string) {
    this.pool = new Pool({ 
      connectionString: connectionString || config.DATABASE_URL 
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  // Check if database connection is working
  async validateConnection(): Promise<boolean> {
    try {
      await this.db.execute(sql`SELECT 1`);
      logger.info('Database connection validated successfully');
      return true;
    } catch (error) {
      logger.error('Database connection validation failed', error as Error);
      return false;
    }
  }

  // Check if migrations table exists
  async checkMigrationsTable(): Promise<boolean> {
    try {
      const result = await this.db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '__drizzle_migrations'
        );
      `);
      return result.rows[0]?.exists === true;
    } catch (error) {
      logger.error('Failed to check migrations table', error as Error);
      return false;
    }
  }

  // Get current migration status using Drizzle's migration tracking
  async getMigrationStatus(): Promise<{
    appliedMigrations: string[];
    availableMigrations: string[];
    lastMigration?: string;
  }> {
    try {
      const migrationsPath = path.resolve(process.cwd(), 'migrations');
      
      // Get available migrations from journal
      let availableMigrations: string[] = [];
      try {
        const journalPath = path.join(migrationsPath, 'meta', '_journal.json');
        const journalContent = await fs.readFile(journalPath, 'utf-8');
        const journal = JSON.parse(journalContent);
        availableMigrations = journal.entries.map((entry: any) => entry.tag);
      } catch (error) {
        logger.warn('No Drizzle migration journal found');
      }

      // Get applied migrations from database
      let appliedMigrations: string[] = [];
      const hasTable = await this.checkMigrationsTable();
      
      if (hasTable) {
        const result = await this.db.execute(sql`
          SELECT hash, created_at 
          FROM __drizzle_migrations 
          ORDER BY created_at ASC;
        `);
        appliedMigrations = result.rows.map(row => row.hash as string);
      }

      const lastMigration = appliedMigrations.length > 0 
        ? appliedMigrations[appliedMigrations.length - 1] 
        : undefined;

      return {
        appliedMigrations,
        availableMigrations,
        lastMigration,
      };
    } catch (error) {
      logger.error('Failed to get migration status', error as Error);
      throw error;
    }
  }

  // Run pending migrations using Drizzle's native migration system
  async runMigrations(): Promise<boolean> {
    try {
      logger.info('Starting database migrations');
      
      const isValid = await this.validateConnection();
      if (!isValid) {
        throw new Error('Database connection is not valid');
      }

      const migrationsPath = path.resolve(process.cwd(), 'migrations');
      
      // Check if migrations directory exists with proper Drizzle structure
      try {
        await fs.access(path.join(migrationsPath, 'meta', '_journal.json'));
        logger.info('Found Drizzle migration files');
      } catch (error) {
        logger.info('No Drizzle migrations found, please run: npx drizzle-kit generate');
        return false;
      }

      // Check if tables already exist and schema is valid
      const schemaValid = await this.verifySchema();
      const hasTable = await this.checkMigrationsTable();
      
      if (schemaValid && !hasTable) {
        // Tables exist but no migration tracking - mark initial migration as applied
        logger.info('Tables exist but no migration tracking found, initializing migration state');
        await this.initializeMigrationState();
        return true;
      }
      
      if (schemaValid && hasTable) {
        // Check if we need to run any new migrations
        const status = await this.getMigrationStatus();
        if (status.appliedMigrations.length === status.availableMigrations.length) {
          logger.info('All migrations already applied, skipping');
          return true;
        }
      }

      // Run Drizzle migrations
      logger.info('Running Drizzle migrations');
      await migrate(this.db, { migrationsFolder: migrationsPath });
      
      logger.info('Database migrations completed successfully');
      return true;
    } catch (error) {
      // Check if error is due to tables already existing
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.warn('Tables already exist, initializing migration state');
        await this.initializeMigrationState();
        return true;
      }
      
      logger.error('Database migration failed', error as Error);
      return false;
    }
  }

  // Initialize migration state for existing database
  async initializeMigrationState(): Promise<void> {
    try {
      logger.info('Initializing migration state for existing database');
      
      // Create migration tracking table if it doesn't exist
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
      `);
      
      // Read the journal to get the initial migration hash
      const migrationsPath = path.resolve(process.cwd(), 'migrations');
      const journalPath = path.join(migrationsPath, 'meta', '_journal.json');
      
      try {
        const journalContent = await fs.readFile(journalPath, 'utf-8');
        const journal = JSON.parse(journalContent);
        
        if (journal.entries && journal.entries.length > 0) {
          const firstMigration = journal.entries[0];
          
          // Check if this migration is already recorded
          const existing = await this.db.execute(sql`
            SELECT hash FROM __drizzle_migrations WHERE hash = ${firstMigration.tag};
          `);
          
          if (existing.rows.length === 0) {
            // Mark the initial migration as applied
            await this.db.execute(sql`
              INSERT INTO __drizzle_migrations (hash, created_at) 
              VALUES (${firstMigration.tag}, ${Date.now()});
            `);
            
            logger.info(`Marked initial migration ${firstMigration.tag} as applied`);
          }
        }
      } catch (error) {
        logger.warn('Could not read migration journal, continuing without initialization');
      }
    } catch (error) {
      logger.error('Failed to initialize migration state', error as Error);
      throw error;
    }
  }

  // Check if migrations need to be generated (Drizzle approach)
  async checkMigrationsGenerated(): Promise<boolean> {
    try {
      const migrationsPath = path.resolve(process.cwd(), 'migrations');
      const journalPath = path.join(migrationsPath, 'meta', '_journal.json');
      
      await fs.access(journalPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Verify database schema matches current models
  async verifySchema(): Promise<boolean> {
    try {
      logger.info('Verifying database schema');
      
      // Check if required tables exist
      const tablesQuery = sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'scan_results');
      `;
      
      const result = await this.db.execute(tablesQuery);
      const existingTables = result.rows.map(row => row.table_name);
      
      const requiredTables = ['users', 'scan_results'];
      const missingTables = requiredTables.filter(
        table => !existingTables.includes(table)
      );
      
      if (missingTables.length > 0) {
        logger.warn('Missing database tables', { missingTables });
        return false;
      }
      
      // Verify column structure for critical tables
      await this.verifyTableStructure('users', [
        'id', 'username', 'password'
      ]);
      
      await this.verifyTableStructure('scan_results', [
        'id', 'business_name', 'website', 'email', 'scan_data', 'status', 'created_at'
      ]);
      
      logger.info('Database schema verification completed successfully');
      return true;
    } catch (error) {
      logger.error('Database schema verification failed', error as Error);
      return false;
    }
  }

  // Verify specific table structure
  private async verifyTableStructure(tableName: string, requiredColumns: string[]): Promise<void> {
    const columnsQuery = sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName};
    `;
    
    const result = await this.db.execute(columnsQuery);
    const existingColumns = result.rows.map(row => row.column_name);
    
    const missingColumns = requiredColumns.filter(
      column => !existingColumns.includes(column)
    );
    
    if (missingColumns.length > 0) {
      logger.warn(`Table ${tableName} is missing columns`, { missingColumns });
      throw new Error(`Table ${tableName} is missing required columns: ${missingColumns.join(', ')}`);
    }
  }

  // Reset database to clean state (development only)
  async resetDatabase(): Promise<boolean> {
    if (config.NODE_ENV === 'production') {
      logger.error('Database reset is not allowed in production');
      return false;
    }
    
    try {
      logger.warn('Resetting database (development mode only)');
      
      // Drop all tables
      await this.db.execute(sql`DROP TABLE IF EXISTS "scan_results" CASCADE;`);
      await this.db.execute(sql`DROP TABLE IF EXISTS "users" CASCADE;`);
      await this.db.execute(sql`DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE;`);
      
      // Re-run migrations
      await this.runMigrations();
      
      logger.info('Database reset completed successfully');
      return true;
    } catch (error) {
      logger.error('Database reset failed', error as Error);
      return false;
    }
  }

  // Close database connection
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection closed');
  }
}

// Singleton instance for the application
export const migrator = new DatabaseMigrator();