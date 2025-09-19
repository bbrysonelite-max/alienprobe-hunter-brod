import { storage } from '../storage';
import { emailMailer } from './mailer';
import { emailTemplateManager } from './templates';
import { emailScheduler } from './scheduler';
import { logger } from '../logger';
import type { EmailQueue, Lead } from '@shared/schema';

export class EmailProcessor {
  private isRunning = false;
  private processInterval: NodeJS.Timeout | null = null;
  private readonly PROCESS_INTERVAL_MS = 30 * 1000; // 30 seconds
  private readonly BATCH_SIZE = 10;
  private inFlightJobs: Set<string> = new Set(); // Track in-flight email IDs
  private processingPromise: Promise<void> | null = null; // Track current processing cycle

  /**
   * Start the email processor
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Email processor already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting email processor', {
      intervalMs: this.PROCESS_INTERVAL_MS,
      batchSize: this.BATCH_SIZE
    });

    // Process immediately, then at intervals
    this.processEmails();
    this.processInterval = setInterval(() => {
      this.processEmails();
    }, this.PROCESS_INTERVAL_MS);
  }

  /**
   * Stop the email processor gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping email processor...');
    this.isRunning = false;
    
    // Stop the interval timer
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    // Wait for current processing cycle to complete
    if (this.processingPromise) {
      logger.info('Waiting for current processing cycle to complete...');
      await this.processingPromise;
    }

    // Wait for all in-flight jobs to complete
    if (this.inFlightJobs.size > 0) {
      logger.info(`Waiting for ${this.inFlightJobs.size} in-flight email(s) to complete...`);
      // Wait up to 30 seconds for in-flight jobs to complete
      const maxWaitTime = 30000;
      const startTime = Date.now();
      while (this.inFlightJobs.size > 0 && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (this.inFlightJobs.size > 0) {
        logger.warn(`Force stopping with ${this.inFlightJobs.size} in-flight email(s) still pending`);
      }
    }

    logger.info('Email processor stopped gracefully');
  }

  /**
   * Manually trigger email processing immediately
   */
  async triggerNow(): Promise<{ processed: number; failed: number }> {
    logger.info('Manual email processing triggered');
    
    if (!this.isRunning) {
      throw new Error('Email processor is not running');
    }

    // Process emails immediately and return results
    const result = await this.processEmailsWithResult();
    
    logger.info('Manual email processing completed', result);
    return result;
  }

  /**
   * Process pending and retryable emails
   */
  private async processEmails(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Track the processing promise for graceful shutdown
    this.processingPromise = this.processEmailsWithResult().then(() => {}).catch(error => {
      logger.error('Error in email processing cycle', error as Error);
    });

    await this.processingPromise;
    this.processingPromise = null;
  }

  /**
   * Process emails and return result counts
   */
  private async processEmailsWithResult(): Promise<{ processed: number; failed: number }> {
    if (!this.isRunning) {
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;

    try {
      // Process regular pending emails
      const pendingEmails = await storage.getReadyEmails(this.BATCH_SIZE);
      if (pendingEmails.length > 0) {
        logger.info('Processing pending emails', { count: pendingEmails.length });
        const pendingResult = await this.processBatch(pendingEmails);
        processed += pendingResult.processed;
        failed += pendingResult.failed;
      }

      // Process retryable emails
      const retryableEmails = await storage.getRetryableEmails(this.BATCH_SIZE);
      if (retryableEmails.length > 0) {
        logger.info('Processing retryable emails', { count: retryableEmails.length });
        const retryableResult = await this.processBatch(retryableEmails);
        processed += retryableResult.processed;
        failed += retryableResult.failed;
      }

      if (pendingEmails.length === 0 && retryableEmails.length === 0) {
        logger.debug('No emails to process');
      }
    } catch (error) {
      logger.error('Error in email processing cycle', error as Error);
      failed++;
    }

    return { processed, failed };
  }

  /**
   * Process a batch of emails
   */
  private async processBatch(emails: EmailQueue[]): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const email of emails) {
      if (!this.isRunning) {
        break; // Stop processing if shutdown requested
      }

      // Mark email as processing to prevent duplicate processing
      await storage.updateEmailQueue(email.id, { status: 'processing' });
      this.inFlightJobs.add(email.id);

      try {
        await this.processSingleEmail(email);
        processed++;
      } catch (error) {
        logger.error('Error processing single email', error as Error, {
          emailId: email.id,
          leadId: email.leadId,
          templateKey: email.templateKey
        });
        failed++;
      } finally {
        this.inFlightJobs.delete(email.id);
      }
    }

    return { processed, failed };
  }

  /**
   * Process a single email
   */
  private async processSingleEmail(emailQueue: EmailQueue): Promise<void> {
    try {
      // Get lead information
      const lead = await storage.getLead(emailQueue.leadId);
      if (!lead) {
        await this.markEmailFailed(emailQueue.id, 'Lead not found');
        return;
      }

      if (!lead.email) {
        await this.markEmailFailed(emailQueue.id, 'Lead has no email address');
        return;
      }

      // Get email template
      const template = await emailTemplateManager.getTemplate(emailQueue.templateKey);
      if (!template) {
        await this.markEmailFailed(emailQueue.id, `Template not found: ${emailQueue.templateKey}`);
        return;
      }

      // Build template variables
      const variables = emailTemplateManager.buildVariablesFromLead(lead, {
        verificationUrl: this.buildVerificationUrl(lead),
        unsubscribeUrl: this.buildUnsubscribeUrl(lead)
      });

      // Render template
      const { subject, body } = emailTemplateManager.renderTemplate(template, variables);

      // Send email
      const result = await emailMailer.sendEmail({
        to: lead.email,
        from: emailMailer.getFromAddress(),
        subject,
        text: body,
        html: this.convertToHtml(body) // Simple text-to-HTML conversion
      });

      if (result.success) {
        await this.markEmailSent(emailQueue.id, result.messageId || 'unknown');
        
        // Log successful send
        await storage.createEmailLog({
          leadId: lead.id,
          templateKey: emailQueue.templateKey,
          status: 'sent',
          providerMessageId: result.messageId
        });

        logger.info('Email sent successfully', {
          emailId: emailQueue.id,
          leadId: lead.id,
          to: lead.email,
          subject,
          messageId: result.messageId
        });
      } else {
        await this.handleEmailFailure(emailQueue, result.error || 'Unknown sending error');
      }
    } catch (error) {
      await this.handleEmailFailure(emailQueue, error instanceof Error ? error.message : 'Processing error');
    }
  }

  /**
   * Handle email sending failure
   */
  private async handleEmailFailure(emailQueue: EmailQueue, error: string): Promise<void> {
    logger.warn('Email sending failed', {
      emailId: emailQueue.id,
      leadId: emailQueue.leadId,
      templateKey: emailQueue.templateKey,
      error,
      retryCount: emailQueue.retryCount
    });

    // Update error information
    await storage.updateEmailQueue(emailQueue.id, {
      lastError: error
    });

    // Log failed attempt
    await storage.createEmailLog({
      leadId: emailQueue.leadId,
      templateKey: emailQueue.templateKey,
      status: 'failed',
      error
    });

    // Attempt to reschedule with exponential backoff
    await emailScheduler.rescheduleFailedEmail(emailQueue.id);
  }

  /**
   * Mark email as sent
   */
  private async markEmailSent(emailId: string, messageId: string): Promise<void> {
    await storage.updateEmailQueue(emailId, {
      status: 'sent'
    });
  }

  /**
   * Mark email as permanently failed
   */
  private async markEmailFailed(emailId: string, error: string): Promise<void> {
    await storage.updateEmailQueue(emailId, {
      status: 'failed',
      lastError: error
    });
  }

  /**
   * Build verification URL for email templates
   */
  private buildVerificationUrl(lead: Lead): string {
    // In production, this would use the actual domain and proper token
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    return `${baseUrl}/api/verify-email?token=VERIFICATION_TOKEN`;
  }

  /**
   * Build unsubscribe URL for email templates
   */
  private buildUnsubscribeUrl(lead: Lead): string {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    return `${baseUrl}/api/unsubscribe?leadId=${lead.id}`;
  }

  /**
   * Simple text-to-HTML conversion
   */
  private convertToHtml(text: string): string {
    return text
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  /**
   * Get processor status
   */
  getStatus(): { isRunning: boolean; intervalMs: number; batchSize: number; inFlightJobs: number; isProcessing: boolean } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.PROCESS_INTERVAL_MS,
      batchSize: this.BATCH_SIZE,
      inFlightJobs: this.inFlightJobs.size,
      isProcessing: this.processingPromise !== null
    };
  }
}

export const emailProcessor = new EmailProcessor();