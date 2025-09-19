import sgMail from '@sendgrid/mail';
import { logger } from '../logger';

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailMailer {
  private sendGridConfigured: boolean = false;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.sendGridConfigured = true;
      logger.info('SendGrid mailer initialized with API key');
    } else {
      logger.info('SendGrid API key not found - using mock email sending');
    }
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    try {
      if (this.sendGridConfigured) {
        return await this.sendViaSendGrid(message);
      } else {
        return this.mockSendEmail(message);
      }
    } catch (error) {
      logger.error('Email sending failed', error as Error, {
        to: message.to,
        subject: message.subject
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown email sending error'
      };
    }
  }

  private async sendViaSendGrid(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const msg = {
        to: message.to,
        from: message.from,
        subject: message.subject,
        text: message.text,
        html: message.html,
      };

      const response = await sgMail.send(msg);
      const messageId = response[0]?.headers?.['x-message-id'] || 'unknown';

      logger.info('Email sent via SendGrid', {
        to: message.to,
        subject: message.subject,
        messageId
      });

      return {
        success: true,
        messageId
      };
    } catch (error: any) {
      logger.error('SendGrid email sending failed', error, {
        to: message.to,
        subject: message.subject,
        sendGridError: error.response?.body
      });

      return {
        success: false,
        error: error.response?.body?.errors?.[0]?.message || error.message || 'SendGrid sending failed'
      };
    }
  }

  private mockSendEmail(message: EmailMessage): EmailSendResult {
    const mockMessageId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Mock email sent (no SendGrid API key)', {
      to: message.to,
      subject: message.subject,
      messageId: mockMessageId,
      textPreview: message.text.substring(0, 100) + '...',
      htmlLength: message.html.length
    });

    // Simulate 95% success rate for testing
    if (Math.random() < 0.95) {
      return {
        success: true,
        messageId: mockMessageId
      };
    } else {
      return {
        success: false,
        error: 'Mock email failure for testing'
      };
    }
  }

  isConfigured(): boolean {
    return this.sendGridConfigured;
  }

  getFromAddress(): string {
    // Use a default from address if not configured
    return process.env.FROM_EMAIL || 'noreply@company.com';
  }
}

export const emailMailer = new EmailMailer();