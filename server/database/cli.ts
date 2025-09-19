#!/usr/bin/env tsx
import { migrator, DatabaseMigrator } from './migrations';
import { seeder, DatabaseSeeder } from './seeder';
import { logger } from '../logger';
import { config } from '../config';

// Command-line interface for database management
class DatabaseCLI {
  
  // Display help information
  displayHelp(): void {
    console.log(`
🛸 Alien Probe Business Scanner - Database CLI

Usage: tsx server/database/cli.ts <command> [options]

Commands:
  migrate              Run database migrations
  migrate:status       Show migration status
  migrate:reset        Reset database (development only)
  
  seed                 Seed database with sample data
  seed:dev             Seed development data
  seed:prod            Seed production data  
  seed:clear           Clear all data (development only)
  
  status               Show database status and statistics
  init                 Initialize database (migrate + seed)
  health               Check database health
  
  help                 Show this help message

Examples:
  tsx server/database/cli.ts migrate
  tsx server/database/cli.ts seed:dev
  tsx server/database/cli.ts status
  tsx server/database/cli.ts init

Environment:
  NODE_ENV: ${config.NODE_ENV}
  Database: ${config.DATABASE_URL ? 'Connected' : 'Not configured'}
`);
  }

  // Run database migrations
  async migrate(): Promise<void> {
    logger.info('Starting database migration');
    const success = await migrator.runMigrations();
    
    if (success) {
      console.log('✅ Database migrations completed successfully');
    } else {
      console.error('❌ Database migrations failed');
      process.exit(1);
    }
  }

  // Show migration status
  async migrationStatus(): Promise<void> {
    try {
      const status = await migrator.getMigrationStatus();
      
      console.log('\n📊 Migration Status:');
      console.log(`Applied migrations: ${status.appliedMigrations.length}`);
      console.log(`Available migrations: ${status.availableMigrations.length}`);
      
      if (status.lastMigration) {
        console.log(`Last migration: ${status.lastMigration}`);
      }
      
      if (status.availableMigrations.length > 0) {
        console.log('\nAvailable migrations:');
        status.availableMigrations.forEach((migration: string) => {
          console.log(`  - ${migration}`);
        });
      }
      
      const schemaValid = await migrator.verifySchema();
      console.log(`Schema validation: ${schemaValid ? '✅ Valid' : '❌ Invalid'}`);
      
    } catch (error) {
      console.error('❌ Failed to get migration status:', error);
      process.exit(1);
    }
  }

  // Reset database (development only)
  async resetDatabase(): Promise<void> {
    if (config.NODE_ENV === 'production') {
      console.error('❌ Database reset is not allowed in production');
      process.exit(1);
    }
    
    console.log('⚠️  This will delete all data in the database!');
    console.log('Resetting database in 3 seconds...');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const success = await migrator.resetDatabase();
    
    if (success) {
      console.log('✅ Database reset completed successfully');
    } else {
      console.error('❌ Database reset failed');
      process.exit(1);
    }
  }

  // Seed database
  async seed(): Promise<void> {
    logger.info('Starting database seeding');
    
    let success = false;
    if (config.NODE_ENV === 'production') {
      success = await seeder.seedProductionData();
    } else {
      success = await seeder.seedDevelopmentData();
    }
    
    if (success) {
      console.log('✅ Database seeding completed successfully');
    } else {
      console.error('❌ Database seeding failed');
      process.exit(1);
    }
  }

  // Seed development data specifically
  async seedDevelopment(): Promise<void> {
    if (config.NODE_ENV === 'production') {
      console.error('❌ Development seeding is not allowed in production');
      process.exit(1);
    }
    
    const success = await seeder.seedDevelopmentData();
    
    if (success) {
      console.log('✅ Development data seeded successfully');
    } else {
      console.error('❌ Development seeding failed');
      process.exit(1);
    }
  }

  // Seed production data specifically
  async seedProduction(): Promise<void> {
    const success = await seeder.seedProductionData();
    
    if (success) {
      console.log('✅ Production data seeded successfully');
    } else {
      console.error('❌ Production seeding failed');
      process.exit(1);
    }
  }

  // Clear all data (development only)
  async clearData(): Promise<void> {
    if (config.NODE_ENV === 'production') {
      console.error('❌ Data clearing is not allowed in production');
      process.exit(1);
    }
    
    console.log('⚠️  This will delete all data in the database!');
    console.log('Clearing data in 3 seconds...');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const success = await seeder.clearAllData();
    
    if (success) {
      console.log('✅ Database data cleared successfully');
    } else {
      console.error('❌ Data clearing failed');
      process.exit(1);
    }
  }

  // Show database status and statistics
  async status(): Promise<void> {
    try {
      console.log('\n🛸 Alien Probe Business Scanner - Database Status\n');
      
      // Check connection
      const isConnected = await migrator.validateConnection();
      console.log(`Connection: ${isConnected ? '✅ Connected' : '❌ Disconnected'}`);
      
      if (!isConnected) {
        console.log('❌ Cannot retrieve database status - no connection');
        process.exit(1);
      }
      
      // Migration status
      const migrationStatus = await migrator.getMigrationStatus();
      console.log(`Migrations: ${migrationStatus.appliedMigrations.length} applied, ${migrationStatus.availableMigrations.length} available`);
      
      // Schema validation
      const schemaValid = await migrator.verifySchema();
      console.log(`Schema: ${schemaValid ? '✅ Valid' : '❌ Invalid'}`);
      
      // Database statistics
      const stats = await seeder.getDatabaseStats();
      console.log(`\nData Statistics:`);
      console.log(`  Users: ${stats.users}`);
      console.log(`  Scan Results: ${stats.scanResults}`);
      
      if (stats.scanResults > 0) {
        console.log(`  Scan Status Breakdown:`);
        Object.entries(stats.scansByStatus).forEach(([status, count]) => {
          console.log(`    ${status}: ${count}`);
        });
      }
      
      // Environment info
      console.log(`\nEnvironment: ${config.NODE_ENV}`);
      console.log(`App Version: ${config.APP_VERSION}`);
      
    } catch (error) {
      console.error('❌ Failed to get database status:', error);
      process.exit(1);
    }
  }

  // Initialize database (migrate + seed)
  async initialize(): Promise<void> {
    console.log('🚀 Initializing database...\n');
    
    // Run migrations
    console.log('1️⃣ Running migrations...');
    await this.migrate();
    
    // Seed data
    console.log('\n2️⃣ Seeding data...');
    await this.seed();
    
    // Show final status
    console.log('\n3️⃣ Final status:');
    await this.status();
    
    console.log('\n✅ Database initialization completed successfully!');
  }

  // Check database health
  async health(): Promise<void> {
    try {
      const isConnected = await migrator.validateConnection();
      const schemaValid = await migrator.verifySchema();
      const stats = await seeder.getDatabaseStats();
      
      const health = {
        connected: isConnected,
        schemaValid,
        hasData: stats.users > 0 || stats.scanResults > 0,
        stats,
        timestamp: new Date().toISOString(),
      };
      
      console.log(JSON.stringify(health, null, 2));
      
      if (!isConnected || !schemaValid) {
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      process.exit(1);
    }
  }

  // Close database connections
  async cleanup(): Promise<void> {
    await migrator.close();
  }
}

// Main CLI execution
async function main() {
  const cli = new DatabaseCLI();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'migrate':
        await cli.migrate();
        break;
      case 'migrate:status':
        await cli.migrationStatus();
        break;
      case 'migrate:reset':
        await cli.resetDatabase();
        break;
      case 'seed':
        await cli.seed();
        break;
      case 'seed:dev':
        await cli.seedDevelopment();
        break;
      case 'seed:prod':
        await cli.seedProduction();
        break;
      case 'seed:clear':
        await cli.clearData();
        break;
      case 'status':
        await cli.status();
        break;
      case 'init':
        await cli.initialize();
        break;
      case 'health':
        await cli.health();
        break;
      case 'help':
      case '--help':
      case '-h':
        cli.displayHelp();
        break;
      default:
        console.error(`❌ Unknown command: ${command || 'none'}`);
        cli.displayHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  } finally {
    await cli.cleanup();
  }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}