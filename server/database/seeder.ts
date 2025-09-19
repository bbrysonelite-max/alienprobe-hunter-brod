import { db } from '../db';
import { users, scanResults } from '@shared/schema';
import { logger } from '../logger';
import { config } from '../config';
import { sql } from 'drizzle-orm';

// Database seeding utilities for development and testing
export class DatabaseSeeder {
  
  // Check if database has any data
  async isDatabaseEmpty(): Promise<boolean> {
    try {
      const userCount = await db.execute(sql`SELECT COUNT(*) FROM users;`);
      const scanCount = await db.execute(sql`SELECT COUNT(*) FROM scan_results;`);
      
      const totalRecords = Number(userCount.rows[0]?.count || 0) + 
                          Number(scanCount.rows[0]?.count || 0);
      
      return totalRecords === 0;
    } catch (error) {
      logger.error('Failed to check if database is empty', error as Error);
      return false;
    }
  }

  // Seed development data
  async seedDevelopmentData(): Promise<boolean> {
    if (config.NODE_ENV === 'production') {
      logger.error('Development seeding is not allowed in production');
      return false;
    }

    try {
      logger.info('Seeding development data');
      
      const isEmpty = await this.isDatabaseEmpty();
      if (!isEmpty) {
        logger.info('Database already contains data, skipping seeding');
        return true;
      }

      // Seed sample users (for development/testing)
      const sampleUsers = [
        {
          username: 'admin',
          password: 'admin123', // In real app, this would be hashed
        },
        {
          username: 'tester',
          password: 'test123',
        },
      ];

      for (const user of sampleUsers) {
        await db.insert(users).values(user).onConflictDoNothing();
      }

      // Seed sample scan results
      const sampleScans = [
        {
          businessName: 'TechStart Solutions',
          website: 'https://techstart.example.com',
          email: 'info@techstart.example.com',
          status: 'completed',
          scanData: JSON.stringify({
            businessScore: 85,
            websiteAnalysis: 'Strong online presence detected',
            insights: [
              'Modern website with good SEO',
              'Active social media presence',
              'Professional branding'
            ],
            completed: true,
            timestamp: new Date().toISOString(),
          }),
        },
        {
          businessName: 'Local Bakery Co',
          website: 'https://localbakery.example.com',
          email: 'hello@localbakery.example.com',
          status: 'completed',
          scanData: JSON.stringify({
            businessScore: 72,
            websiteAnalysis: 'Website found and analyzed',
            insights: [
              'Good local SEO optimization',
              'Mobile-friendly design',
              'Limited online marketing presence'
            ],
            completed: true,
            timestamp: new Date().toISOString(),
          }),
        },
        {
          businessName: 'Digital Marketing Agency',
          website: 'https://digitalmarketing.example.com',
          email: 'contact@digitalmarketing.example.com',
          status: 'completed',
          scanData: JSON.stringify({
            businessScore: 95,
            websiteAnalysis: 'Excellent online presence',
            insights: [
              'Outstanding digital marketing strategy',
              'High-converting website design',
              'Strong brand authority'
            ],
            completed: true,
            timestamp: new Date().toISOString(),
          }),
        },
        {
          businessName: 'StartupX Inc',
          email: 'team@startupx.example.com',
          status: 'scanning',
          scanData: JSON.stringify({
            businessScore: 0,
            websiteAnalysis: 'No website provided',
            timestamp: new Date().toISOString(),
          }),
        },
        {
          businessName: 'Failed Scan Example',
          website: 'https://nonexistent.example.com',
          email: 'test@failed.example.com',
          status: 'failed',
          scanData: JSON.stringify({
            businessScore: 0,
            websiteAnalysis: 'Website analysis failed',
            error: 'Unable to analyze website',
            timestamp: new Date().toISOString(),
          }),
        },
      ];

      for (const scan of sampleScans) {
        await db.insert(scanResults).values(scan);
      }

      logger.info('Development data seeded successfully', {
        users: sampleUsers.length,
        scanResults: sampleScans.length,
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to seed development data', error as Error);
      return false;
    }
  }

  // Seed production initial data (minimal)
  async seedProductionData(): Promise<boolean> {
    try {
      logger.info('Seeding production initial data');
      
      const isEmpty = await this.isDatabaseEmpty();
      if (!isEmpty) {
        logger.info('Database already contains data, skipping production seeding');
        return true;
      }

      // Only seed essential production data
      // For example, default admin user (would normally be created through proper admin setup)
      logger.info('Production database is empty but no automatic seeding configured');
      logger.info('Please create initial admin user through proper admin setup process');
      
      return true;
    } catch (error) {
      logger.error('Failed to seed production data', error as Error);
      return false;
    }
  }

  // Clear all data (development only)
  async clearAllData(): Promise<boolean> {
    if (config.NODE_ENV === 'production') {
      logger.error('Data clearing is not allowed in production');
      return false;
    }

    try {
      logger.warn('Clearing all database data (development mode only)');
      
      // Clear tables in correct order (respecting foreign key constraints)
      await db.delete(scanResults);
      await db.delete(users);
      
      logger.info('All database data cleared successfully');
      return true;
    } catch (error) {
      logger.error('Failed to clear database data', error as Error);
      return false;
    }
  }

  // Get database statistics
  async getDatabaseStats(): Promise<{
    users: number;
    scanResults: number;
    scansByStatus: Record<string, number>;
  }> {
    try {
      // Count users
      const userCountResult = await db.execute(sql`SELECT COUNT(*) FROM users;`);
      const userCount = Number(userCountResult.rows[0]?.count || 0);

      // Count scan results
      const scanCountResult = await db.execute(sql`SELECT COUNT(*) FROM scan_results;`);
      const scanCount = Number(scanCountResult.rows[0]?.count || 0);

      // Count scans by status
      const statusCountResult = await db.execute(sql`
        SELECT status, COUNT(*) as count 
        FROM scan_results 
        GROUP BY status;
      `);
      
      const scansByStatus: Record<string, number> = {};
      statusCountResult.rows.forEach(row => {
        scansByStatus[row.status as string] = Number(row.count);
      });

      return {
        users: userCount,
        scanResults: scanCount,
        scansByStatus,
      };
    } catch (error) {
      logger.error('Failed to get database statistics', error as Error);
      throw error;
    }
  }
}

// Singleton instance for the application
export const seeder = new DatabaseSeeder();