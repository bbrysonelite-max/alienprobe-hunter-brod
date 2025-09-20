/**
 * Hunter Brody Autonomous Scheduler
 * Runs discovery jobs automatically without human intervention
 */

import { logger } from "../logger";
import { discoveryEngine, type BusinessSearchParams } from "./discovery-engine";

export interface HuntingJob {
  id: string;
  name: string;
  searchParams: BusinessSearchParams;
  schedule: string; // cron-like: daily, hourly, etc.
  enabled: boolean;
  maxResultsPerRun: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
  totalDiscovered: number;
  successfulRuns: number;
  failedRuns: number;
}

/**
 * Autonomous Hunter Scheduler
 */
export class HunterScheduler {
  private jobs: Map<string, HuntingJob> = new Map();
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.initializeDefaultJobs();
  }

  /**
   * Initialize default hunting jobs
   */
  private initializeDefaultJobs() {
    // Local Restaurant Hunter - Family-owned, essential dining 
    this.addJob({
      id: 'hunt_restaurants',
      name: 'Local Restaurant Hunter',
      searchParams: {
        industry: 'restaurant',
        location: 'United States',
        keywords: 'family restaurant local dining pizza deli cafe',
        minRating: 3.5
      },
      schedule: 'daily',
      enabled: true,
      maxResultsPerRun: 50,
      totalDiscovered: 0,
      successfulRuns: 0,
      failedRuns: 0
    });

    // Home Services Hunter - Essential contractors and professionals
    this.addJob({
      id: 'hunt_services',
      name: 'Home Services Hunter',
      searchParams: {
        industry: 'services',
        location: 'United States', 
        keywords: 'plumbing electrical pest control landscaping cleaning roofing',
        minRating: 3.5
      },
      schedule: 'daily',
      enabled: true,
      maxResultsPerRun: 35,
      totalDiscovered: 0,
      successfulRuns: 0,
      failedRuns: 0
    });

    // Essential Services Hunter - Warren Buffett businesses ($1M-$20M revenue)
    this.addJob({
      id: 'hunt_essential_services',
      name: 'Essential Services Hunter',
      searchParams: {
        industry: 'automotive services',
        location: 'United States',
        keywords: 'auto repair dry cleaner HVAC plumber electrician dentist salon',
        minRating: 3.5
      },
      schedule: 'daily',
      enabled: true,
      maxResultsPerRun: 40,
      totalDiscovered: 0,
      successfulRuns: 0,
      failedRuns: 0
    });

    logger.info('🎯 Hunter Brody scheduled jobs initialized', {
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.keys())
    });
  }

  /**
   * Start the autonomous hunting scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn('Hunter scheduler already running');
      return;
    }

    this.isRunning = true;
    
    // Run every 30 minutes to check for due jobs
    this.intervalHandle = setInterval(async () => {
      await this.checkAndRunJobs();
    }, 30 * 60 * 1000); // 30 minutes

    // Run immediately on start
    this.checkAndRunJobs();

    logger.info('🚀 Hunter Brody autonomous scheduler started', {
      checkInterval: '30 minutes',
      activeJobs: this.getActiveJobs().length
    });
  }

  /**
   * Stop the autonomous hunting scheduler
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    
    this.isRunning = false;
    logger.info('🛑 Hunter Brody scheduler stopped');
  }

  /**
   * Check and run due jobs
   */
  private async checkAndRunJobs() {
    const now = new Date();
    const dueJobs = this.getDueJobs(now);

    if (dueJobs.length === 0) {
      logger.debug('No hunting jobs due', { currentTime: now.toISOString() });
      return;
    }

    logger.info('🔍 Running due hunting jobs', {
      jobCount: dueJobs.length,
      jobs: dueJobs.map(j => j.name)
    });

    for (const job of dueJobs) {
      await this.runJob(job);
    }
  }

  /**
   * Get jobs that are due to run
   */
  private getDueJobs(now: Date): HuntingJob[] {
    const dueJobs: HuntingJob[] = [];

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;

      if (this.isJobDue(job, now)) {
        dueJobs.push(job);
      }
    }

    return dueJobs;
  }

  /**
   * Check if a job is due to run
   */
  private isJobDue(job: HuntingJob, now: Date): boolean {
    if (!job.lastRunAt) {
      return true; // Never run before
    }

    const timeSinceLastRun = now.getTime() - job.lastRunAt.getTime();
    const scheduleMs = this.getScheduleIntervalMs(job.schedule);

    return timeSinceLastRun >= scheduleMs;
  }

  /**
   * Convert schedule string to milliseconds
   */
  private getScheduleIntervalMs(schedule: string): number {
    switch (schedule.toLowerCase()) {
      case 'hourly': return 60 * 60 * 1000;
      case 'daily': return 24 * 60 * 60 * 1000;
      case 'weekly': return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // Default to daily
    }
  }

  /**
   * Run a specific hunting job
   */
  async runJob(job: HuntingJob): Promise<void> {
    const startTime = new Date();
    
    logger.info(`🎯 Starting hunting job: ${job.name}`, {
      jobId: job.id,
      searchParams: job.searchParams,
      maxResults: job.maxResultsPerRun
    });

    try {
      // Run discovery
      const result = await discoveryEngine.discoverBusinesses(
        job.searchParams,
        job.maxResultsPerRun
      );

      // Process each discovered business
      let processedCount = 0;
      for (const business of result.businesses) {
        const leadId = await discoveryEngine.processDiscoveredBusiness(business);
        if (leadId) {
          processedCount++;
        }
      }

      // Update job statistics
      job.lastRunAt = startTime;
      job.nextRunAt = new Date(startTime.getTime() + this.getScheduleIntervalMs(job.schedule));
      job.totalDiscovered += result.totalFound;
      job.successfulRuns++;

      logger.info(`✅ Hunting job completed: ${job.name}`, {
        jobId: job.id,
        discovered: result.totalFound,
        processed: processedCount,
        quotaUsed: result.quotaUsed,
        duration: Date.now() - startTime.getTime()
      });

    } catch (error) {
      job.failedRuns++;
      
      logger.error(`❌ Hunting job failed: ${job.name}`, {
        jobId: job.id,
        error: error.message,
        duration: Date.now() - startTime.getTime()
      });
    }
  }

  /**
   * Add a new hunting job
   */
  addJob(job: HuntingJob) {
    this.jobs.set(job.id, job);
    logger.info('📝 Hunting job added', { jobId: job.id, name: job.name });
  }

  /**
   * Remove a hunting job
   */
  removeJob(jobId: string) {
    const removed = this.jobs.delete(jobId);
    if (removed) {
      logger.info('🗑️ Hunting job removed', { jobId });
    }
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): HuntingJob[] {
    return Array.from(this.jobs.values()).filter(job => job.enabled);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): HuntingJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get job statistics
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    
    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(j => j.enabled).length,
      totalDiscovered: jobs.reduce((sum, j) => sum + j.totalDiscovered, 0),
      successfulRuns: jobs.reduce((sum, j) => sum + j.successfulRuns, 0),
      failedRuns: jobs.reduce((sum, j) => sum + j.failedRuns, 0),
      quotaStatus: discoveryEngine.getQuotaStatus()
    };
  }

  /**
   * Enable/disable a job
   */
  toggleJob(jobId: string, enabled: boolean) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = enabled;
      logger.info(`🔄 Job ${enabled ? 'enabled' : 'disabled'}`, { jobId, name: job.name });
    }
  }
}

// Export singleton instance  
export const hunterScheduler = new HunterScheduler();