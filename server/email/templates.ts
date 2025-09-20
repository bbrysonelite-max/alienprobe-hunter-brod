import { storage } from '../storage';
import { logger } from '../logger';
import type { EmailTemplate, Lead } from '@shared/schema';

export interface TemplateVariables {
  leadName?: string;
  businessName?: string;
  contactName?: string;
  verificationUrl?: string;
  unsubscribeUrl?: string;
  companyName?: string;
  reportUrl?: string;
  scanDate?: string;
  reportSummary?: string;
  downloadUrl?: string;
  [key: string]: string | undefined;
}

export class EmailTemplateManager {
  
  async getTemplate(key: string): Promise<EmailTemplate | null> {
    try {
      const template = await storage.getEmailTemplate(key);
      if (!template) {
        logger.warn(`Email template not found: ${key}`);
        return null;
      }
      
      if (!template.enabled) {
        logger.warn(`Email template disabled: ${key}`);
        return null;
      }
      
      return template;
    } catch (error) {
      logger.error(`Failed to get email template: ${key}`, error as Error);
      return null;
    }
  }

  renderTemplate(template: EmailTemplate, variables: TemplateVariables): { subject: string; body: string } {
    const subject = this.substituteVariables(template.subject, variables);
    const body = this.substituteVariables(template.body, variables);
    
    return { subject, body };
  }

  private substituteVariables(content: string, variables: TemplateVariables): string {
    let result = content;
    
    // Replace template variables in the format {{variableName}}
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, value);
      }
    }
    
    // Remove any unreplaced variables
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    
    return result;
  }

  buildVariablesFromLead(lead: Lead, extraVars: Partial<TemplateVariables> = {}): TemplateVariables {
    return {
      leadName: lead.contactName || lead.businessName,
      businessName: lead.businessName,
      contactName: lead.contactName || undefined,
      companyName: 'Your Company', // Configure this based on your company
      ...extraVars
    };
  }

  async createDefaultTemplates(): Promise<void> {
    try {
      const defaultTemplates = [
        {
          key: 'verification',
          step: 'verification',
          subject: 'Please verify your email - {{businessName}}',
          body: `Hi {{leadName}},

Thank you for your interest in our services for {{businessName}}.

Please verify your email address by clicking the link below:
{{verificationUrl}}

This link will expire in 24 hours.

Best regards,
{{companyName}} Team

---
If you did not request this verification, please ignore this email.
{{unsubscribeUrl}}`,
          enabled: true
        },
        {
          key: 'welcome',
          step: 'welcome',
          subject: 'Welcome to {{companyName}} - {{businessName}}',
          body: `Hi {{leadName}},

Welcome to {{companyName}}! We're excited to help {{businessName}} grow.

Here's what you can expect next:
• A personalized consultation within 24 hours
• Custom recommendations for your business
• Access to our premium resources

We'll be in touch soon to discuss how we can help {{businessName}} achieve its goals.

Best regards,
{{companyName}} Team

---
{{unsubscribeUrl}}`,
          enabled: true
        },
        {
          key: 'follow_up_1',
          step: 'follow_up_1',
          subject: 'Quick follow-up - {{businessName}}',
          body: `Hi {{leadName}},

I wanted to follow up on your interest in our services for {{businessName}}.

Have you had a chance to review our initial recommendations? I'd love to discuss how we can help you move forward.

Would you be available for a quick 15-minute call this week?

Best regards,
{{companyName}} Team

---
{{unsubscribeUrl}}`,
          enabled: true
        },
        {
          key: 'follow_up_2',
          step: 'follow_up_2',
          subject: 'Still thinking it over? - {{businessName}}',
          body: `Hi {{leadName}},

I understand that making decisions for {{businessName}} takes time.

Here are some resources that might help:
• Case study: How we helped similar businesses
• ROI calculator for your industry
• Free consultation booking link

No pressure - just here when you're ready to move forward.

Best regards,
{{companyName}} Team

---
{{unsubscribeUrl}}`,
          enabled: true
        },
        {
          key: 'follow_up_3',
          step: 'follow_up_3',
          subject: 'Last check-in - {{businessName}}',
          body: `Hi {{leadName}},

This is my final follow-up regarding our services for {{businessName}}.

If you're still interested, I'm here to help. Otherwise, I'll remove you from our follow-up sequence.

Feel free to reach out whenever you're ready to discuss how we can help {{businessName}} grow.

Best regards,
{{companyName}} Team

---
{{unsubscribeUrl}}`,
          enabled: true
        },
        {
          key: 'scan_report',
          step: 'scan_report',
          subject: 'Your Business Analysis Report is Ready - {{businessName}}',
          body: `Hi {{contactName}},

Your comprehensive business analysis report for {{businessName}} is now complete!

Report completed: {{scanDate}}

KEY FINDINGS SUMMARY:
{{reportSummary}}

VIEW YOUR FULL REPORT:
{{reportUrl}}

DOWNLOAD REPORT:
{{downloadUrl}}

This report includes:
• Complete technical analysis of your business systems
• Security assessment and recommendations
• Performance optimization opportunities
• Competitive analysis insights
• Actionable next steps and priorities

Our team will follow up within 24 hours to discuss these findings and help you implement the recommended improvements.

If you have any immediate questions about your report, please don't hesitate to reach out.

Best regards,
{{companyName}} Analysis Team

---
This report is confidential and intended solely for {{businessName}}.
{{unsubscribeUrl}}`,
          enabled: true
        }
      ];

      for (const template of defaultTemplates) {
        const existing = await storage.getEmailTemplate(template.key);
        if (!existing) {
          await storage.createEmailTemplate(template);
          logger.info(`Created default email template: ${template.key}`);
        }
      }
    } catch (error) {
      logger.error('Failed to create default email templates', error as Error);
    }
  }
}

export const emailTemplateManager = new EmailTemplateManager();