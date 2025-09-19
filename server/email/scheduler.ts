import { storage } from '../storage';
import { logger } from '../logger';
import type { Lead, InsertEmailQueue } from '@shared/schema';

export interface ScheduleOptions {
  immediate?: boolean;
  delayDays?: number;
  delayHours?: number;
  delayMinutes?: number;
}

export class EmailScheduler {
  
  /**
   * Schedule a welcome email for a new lead
   */
  async scheduleWelcomeEmail(lead: Lead): Promise<void> {
    if (!lead.email) {
      logger.warn('Cannot schedule welcome email - no email address', { leadId: lead.id });
      return;
    }

    try {
      await this.scheduleEmail(lead.id, 'welcome', { immediate: true });
      logger.info('Welcome email scheduled', { leadId: lead.id, email: lead.email });
    } catch (error) {
      logger.error('Failed to schedule welcome email', error as Error, { leadId: lead.id });
    }
  }

  /**
   * Schedule verification email for a lead
   */
  async scheduleVerificationEmail(lead: Lead): Promise<void> {
    if (!lead.email) {
      logger.warn('Cannot schedule verification email - no email address', { leadId: lead.id });
      return;
    }

    try {
      await this.scheduleEmail(lead.id, 'verification', { immediate: true });
      logger.info('Verification email scheduled', { leadId: lead.id, email: lead.email });
    } catch (error) {
      logger.error('Failed to schedule verification email', error as Error, { leadId: lead.id });
    }
  }

  /**
   * Schedule follow-up sequence for a lead
   */
  async scheduleFollowUpSequence(lead: Lead): Promise<void> {
    if (!lead.email) {
      logger.warn('Cannot schedule follow-up sequence - no email address', { leadId: lead.id });
      return;
    }

    try {
      // Follow-up 1: 1 day after
      await this.scheduleEmail(lead.id, 'follow_up_1', { delayDays: 1 });
      
      // Follow-up 2: 3 days after
      await this.scheduleEmail(lead.id, 'follow_up_2', { delayDays: 3 });
      
      // Follow-up 3: 7 days after  
      await this.scheduleEmail(lead.id, 'follow_up_3', { delayDays: 7 });

      logger.info('Follow-up sequence scheduled', { 
        leadId: lead.id, 
        email: lead.email,
        sequenceCount: 3
      });
    } catch (error) {
      logger.error('Failed to schedule follow-up sequence', error as Error, { leadId: lead.id });
    }
  }

  /**
   * Schedule verification reminders for unverified leads
   */
  async scheduleVerificationReminders(lead: Lead): Promise<void> {
    if (!lead.email || lead.status === 'verified') {
      return;
    }

    try {
      // Schedule 3 verification reminders at 1-day intervals
      for (let i = 1; i <= 3; i++) {
        await this.scheduleEmail(lead.id, 'verification', { delayDays: i });
      }

      logger.info('Verification reminders scheduled', { 
        leadId: lead.id, 
        email: lead.email,
        reminderCount: 3
      });
    } catch (error) {
      logger.error('Failed to schedule verification reminders', error as Error, { leadId: lead.id });
    }
  }

  /**
   * Cancel all pending emails for a lead
   */
  async cancelLeadEmails(leadId: string): Promise<void> {
    try {
      const pendingEmails = await storage.getEmailQueueByLead(leadId);
      const pendingItems = pendingEmails.filter(email => 
        email.status === 'pending' || email.status === 'retrying'
      );

      for (const email of pendingItems) {
        await storage.updateEmailQueue(email.id, { 
          status: 'failed',
          lastError: 'Cancelled by system'
        });
      }

      logger.info('Lead emails cancelled', { 
        leadId, 
        cancelledCount: pendingItems.length 
      });
    } catch (error) {
      logger.error('Failed to cancel lead emails', error as Error, { leadId });
    }
  }

  /**
   * Reschedule failed emails with exponential backoff
   */
  async rescheduleFailedEmail(emailId: string): Promise<void> {
    try {
      const emailItem = await storage.getEmailQueue(emailId);
      if (!emailItem) {
        logger.warn('Email not found for rescheduling', { emailId });
        return;
      }

      const maxRetries = 3;
      const currentRetries = emailItem.retryCount || 0;

      if (currentRetries >= maxRetries) {
        await storage.updateEmailQueue(emailId, {
          status: 'failed',
          lastError: `Maximum retry attempts (${maxRetries}) exceeded`
        });
        
        logger.warn('Email failed permanently - max retries exceeded', {
          emailId,
          retryCount: currentRetries,
          maxRetries
        });
        return;
      }

      // Exponential backoff: 2^retry_count hours
      const backoffHours = Math.pow(2, currentRetries);
      const nextRetryAt = new Date(Date.now() + (backoffHours * 60 * 60 * 1000));

      await storage.updateEmailQueue(emailId, {
        status: 'retrying',
        retryCount: currentRetries + 1,
        nextRetryAt
      });

      logger.info('Email rescheduled with exponential backoff', {
        emailId,
        retryCount: currentRetries + 1,
        nextRetryAt,
        backoffHours
      });
    } catch (error) {
      logger.error('Failed to reschedule email', error as Error, { emailId });
    }
  }

  /**
   * Core method to schedule an email
   */
  private async scheduleEmail(
    leadId: string, 
    templateKey: string, 
    options: ScheduleOptions
  ): Promise<void> {
    let scheduledAt: Date;

    if (options.immediate) {
      scheduledAt = new Date();
    } else {
      const delayMs = this.calculateDelayMs(options);
      scheduledAt = new Date(Date.now() + delayMs);
    }

    const emailQueue: InsertEmailQueue = {
      leadId,
      templateKey,
      scheduledAt,
      status: 'pending',
      retryCount: 0
    };

    await storage.createEmailQueue(emailQueue);
  }

  /**
   * Calculate delay in milliseconds from options
   */
  private calculateDelayMs(options: ScheduleOptions): number {
    const { delayDays = 0, delayHours = 0, delayMinutes = 0 } = options;
    
    return (delayDays * 24 * 60 * 60 * 1000) + 
           (delayHours * 60 * 60 * 1000) + 
           (delayMinutes * 60 * 1000);
  }

  /**
   * Get email queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    retrying: number;
    sent: number;
    failed: number;
  }> {
    try {
      // This would require additional query methods, but for now return basic stats
      const allEmails = await storage.getReadyEmails(1000); // Get a large sample
      
      const stats = {
        pending: 0,
        retrying: 0,
        sent: 0,
        failed: 0
      };

      // Note: This is a simplified version. In production, you'd want proper aggregation queries
      allEmails.forEach(email => {
        stats[email.status as keyof typeof stats]++;
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get queue stats', error as Error);
      return { pending: 0, retrying: 0, sent: 0, failed: 0 };
    }
  }
}

export const emailScheduler = new EmailScheduler();