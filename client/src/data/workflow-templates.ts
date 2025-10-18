/**
 * Pre-built Workflow Templates for Common Business Tasks
 * These templates help users quickly set up automation workflows
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  businessType: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  definition: {
    steps: any[];
    edges: any[];
    entry: string;
    metadata?: {
      name?: string;
      description?: string;
      version?: string;
    };
  };
  instructions: string;
  estimatedTime: string;
  benefits: string[];
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'lead-discovery-basic',
    name: 'Basic Lead Discovery',
    description: 'Automatically discover and qualify new business leads based on industry and location criteria',
    businessType: 'general',
    category: 'Lead Generation',
    difficulty: 'beginner',
    estimatedTime: '5 minutes',
    benefits: [
      'Automated lead discovery 24/7',
      'Consistent qualification criteria',
      'Immediate notification of new prospects',
      'Time savings of 10+ hours per week'
    ],
    instructions: `
# Basic Lead Discovery Workflow

## Overview
This workflow automatically discovers new business leads matching your criteria and notifies you of qualified prospects.

## Steps
1. **Define Search Criteria**: Specify industry, location, and business size
2. **Run Discovery**: System searches for matching businesses
3. **Qualify Leads**: Automated scoring based on fit criteria
4. **Notify Team**: Email alerts for high-quality leads

## Customization
- Adjust search parameters in step 1
- Modify qualification scoring in step 3
- Change notification recipients in step 4

## Best Practices
- Start with broad criteria and refine based on results
- Review qualified leads weekly to improve criteria
- Set realistic daily/weekly lead targets
    `.trim(),
    definition: {
      steps: [
        {
          key: 'search_leads',
          type: 'lead_discovery',
          title: 'Search for New Leads',
          config: {
            searchCriteria: {
              industry: 'technology',
              location: 'US',
              employeeRange: '10-50'
            },
            limit: 10
          }
        },
        {
          key: 'qualify_leads',
          type: 'lead_qualification',
          title: 'Qualify Discovered Leads',
          config: {
            scoringCriteria: {
              hasWebsite: 10,
              socialMediaPresence: 5,
              employeeCount: 5
            },
            threshold: 15
          }
        },
        {
          key: 'notify_team',
          type: 'email_notification',
          title: 'Send Notification',
          config: {
            recipientEmail: '${ADMIN_EMAIL}',
            subject: 'New Qualified Leads Discovered',
            template: 'lead_summary'
          }
        }
      ],
      edges: [
        { from: 'search_leads', to: 'qualify_leads' },
        { from: 'qualify_leads', to: 'notify_team', when: 'qualifiedCount > 0' }
      ],
      entry: 'search_leads',
      metadata: {
        name: 'Basic Lead Discovery',
        description: 'Automated lead discovery and qualification',
        version: '1.0'
      }
    }
  },
  {
    id: 'scan-and-follow-up',
    name: 'Business Scan & Follow-up',
    description: 'Automatically scan a business and send personalized follow-up email with insights',
    businessType: 'general',
    category: 'Customer Engagement',
    difficulty: 'beginner',
    estimatedTime: '3 minutes',
    benefits: [
      'Automated business analysis',
      'Personalized outreach at scale',
      'Improved response rates',
      'Consistent follow-up process'
    ],
    instructions: `
# Business Scan & Follow-up Workflow

## Overview
Scan a business to gather insights, then automatically send a personalized email with recommendations.

## Steps
1. **Initiate Scan**: Trigger business analysis
2. **Generate Insights**: AI processes business data
3. **Send Follow-up**: Automated email with personalized insights

## When to Use
- New prospect discovery
- Quarterly customer check-ins
- Re-engagement campaigns
- Partnership outreach

## Customization Tips
- Adjust scan depth in step 1
- Customize email template in step 3
- Add additional qualification steps
    `.trim(),
    definition: {
      steps: [
        {
          key: 'trigger_scan',
          type: 'business_scan',
          title: 'Scan Business',
          config: {
            businessName: '${INPUT.businessName}',
            includeWebsite: true,
            depth: 'standard'
          }
        },
        {
          key: 'wait_for_completion',
          type: 'wait',
          title: 'Wait for Scan Completion',
          config: {
            maxWaitTime: 300,
            checkInterval: 10
          }
        },
        {
          key: 'send_email',
          type: 'email_notification',
          title: 'Send Follow-up Email',
          config: {
            recipientEmail: '${INPUT.contactEmail}',
            subject: 'Your Business Analysis Results',
            template: 'scan_report',
            attachScanData: true
          }
        }
      ],
      edges: [
        { from: 'trigger_scan', to: 'wait_for_completion' },
        { from: 'wait_for_completion', to: 'send_email', when: 'scanStatus === "completed"' }
      ],
      entry: 'trigger_scan'
    }
  },
  {
    id: 'daily-lead-hunt',
    name: 'Daily Lead Hunt',
    description: 'Scheduled daily workflow to hunt for new leads, qualify them, and update CRM',
    businessType: 'general',
    category: 'Lead Generation',
    difficulty: 'intermediate',
    estimatedTime: '10 minutes',
    benefits: [
      'Daily pipeline growth',
      'Automated CRM updates',
      'Consistent lead quality',
      'Time savings of 15+ hours per week'
    ],
    instructions: `
# Daily Lead Hunt Workflow

## Overview
Runs daily to discover new leads, qualify them automatically, and add qualified prospects to your pipeline.

## Schedule
Recommended: Run at 9 AM daily (Monday-Friday)

## Steps
1. **Discovery Phase**: Search multiple sources for potential leads
2. **Enrichment**: Gather additional business information
3. **Qualification**: Score and filter based on ICP criteria
4. **CRM Update**: Add qualified leads to your system
5. **Daily Report**: Summary email of results

## Configuration
- Set search parameters for your target market
- Define qualification scoring model
- Configure CRM integration settings
- Customize daily report format

## Monitoring
- Review daily reports for quality
- Adjust criteria based on conversion rates
- Monitor system performance metrics
    `.trim(),
    definition: {
      steps: [
        {
          key: 'search_multiple_sources',
          type: 'multi_source_lead_discovery',
          title: 'Search Multiple Sources',
          config: {
            sources: ['database', 'public_records', 'social_media'],
            searchCriteria: {
              industry: '${CONFIG.targetIndustry}',
              location: '${CONFIG.targetLocation}',
              revenueRange: '${CONFIG.revenueRange}'
            },
            dailyLimit: 50
          }
        },
        {
          key: 'enrich_data',
          type: 'data_enrichment',
          title: 'Enrich Lead Data',
          config: {
            fields: ['companySize', 'revenue', 'techStack', 'socialMedia'],
            sources: ['public_apis', 'web_scraping']
          }
        },
        {
          key: 'qualify_leads',
          type: 'advanced_qualification',
          title: 'Qualify Leads',
          config: {
            scoringModel: {
              industryMatch: 25,
              sizeMatch: 20,
              locationMatch: 15,
              techStackFit: 20,
              growthIndicators: 20
            },
            minimumScore: 60,
            autoReject: true
          }
        },
        {
          key: 'update_crm',
          type: 'crm_integration',
          title: 'Update CRM',
          config: {
            action: 'create_leads',
            pipeline: 'Outbound',
            stage: 'New',
            assignTo: 'round_robin'
          }
        },
        {
          key: 'daily_report',
          type: 'email_notification',
          title: 'Send Daily Summary',
          config: {
            recipientEmail: '${ADMIN_EMAIL}',
            subject: 'Daily Lead Hunt Report - ${DATE}',
            template: 'daily_hunt_summary',
            includeMetrics: true
          }
        }
      ],
      edges: [
        { from: 'search_multiple_sources', to: 'enrich_data' },
        { from: 'enrich_data', to: 'qualify_leads' },
        { from: 'qualify_leads', to: 'update_crm', when: 'qualifiedCount > 0' },
        { from: 'update_crm', to: 'daily_report' },
        { from: 'qualify_leads', to: 'daily_report', when: 'qualifiedCount === 0' }
      ],
      entry: 'search_multiple_sources'
    }
  },
  {
    id: 'restaurant-optimization',
    name: 'Restaurant Performance Optimizer',
    description: 'Analyze restaurant operations and send optimization recommendations',
    businessType: 'restaurant',
    category: 'Industry-Specific',
    difficulty: 'advanced',
    estimatedTime: '15 minutes',
    benefits: [
      'Data-driven insights',
      'Menu optimization recommendations',
      'Operational efficiency improvements',
      'Competitive analysis'
    ],
    instructions: `
# Restaurant Performance Optimizer

## Overview
Comprehensive workflow for analyzing restaurant performance and providing actionable optimization recommendations.

## Analysis Areas
1. **Menu Performance**: Best/worst performing items
2. **Pricing Analysis**: Competitive pricing insights
3. **Review Sentiment**: Customer feedback analysis
4. **Operational Efficiency**: Staffing and service metrics
5. **Market Position**: Competitive landscape

## Setup Requirements
- Access to POS system data (optional but recommended)
- Review platform integrations (Yelp, Google)
- Local market data

## Outputs
- Detailed performance report
- Prioritized recommendations
- Competitive benchmarks
- Implementation roadmap

## Best Practices
- Run weekly for trending insights
- Combine with staff feedback
- Track recommendation implementations
- Measure impact on key metrics
    `.trim(),
    definition: {
      steps: [
        {
          key: 'gather_restaurant_data',
          type: 'restaurant_data_collection',
          title: 'Collect Restaurant Data',
          config: {
            sources: ['pos_system', 'reviews', 'social_media', 'reservations'],
            timeRange: 'last_30_days'
          }
        },
        {
          key: 'analyze_menu',
          type: 'menu_analysis',
          title: 'Analyze Menu Performance',
          config: {
            metrics: ['popularity', 'profitability', 'preparation_time'],
            compareWithCompetitors: true
          }
        },
        {
          key: 'sentiment_analysis',
          type: 'review_sentiment',
          title: 'Analyze Customer Sentiment',
          config: {
            sources: ['yelp', 'google', 'facebook'],
            categories: ['food_quality', 'service', 'ambiance', 'value']
          }
        },
        {
          key: 'competitive_analysis',
          type: 'market_analysis',
          title: 'Competitive Positioning',
          config: {
            radius: '3_miles',
            compareMetrics: ['pricing', 'ratings', 'popular_items']
          }
        },
        {
          key: 'generate_recommendations',
          type: 'ai_recommendation',
          title: 'Generate Optimization Plan',
          config: {
            aiModel: 'gpt-4',
            focusAreas: ['menu', 'pricing', 'operations', 'marketing'],
            prioritize: true
          }
        },
        {
          key: 'send_report',
          type: 'email_notification',
          title: 'Send Performance Report',
          config: {
            recipientEmail: '${INPUT.ownerEmail}',
            subject: 'Your Restaurant Performance Report',
            template: 'restaurant_optimization',
            attachments: ['full_report.pdf', 'recommendations.pdf']
          }
        }
      ],
      edges: [
        { from: 'gather_restaurant_data', to: 'analyze_menu' },
        { from: 'gather_restaurant_data', to: 'sentiment_analysis' },
        { from: 'gather_restaurant_data', to: 'competitive_analysis' },
        { from: 'analyze_menu', to: 'generate_recommendations' },
        { from: 'sentiment_analysis', to: 'generate_recommendations' },
        { from: 'competitive_analysis', to: 'generate_recommendations' },
        { from: 'generate_recommendations', to: 'send_report' }
      ],
      entry: 'gather_restaurant_data'
    }
  }
];

// Helper function to get templates by category
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return workflowTemplates.filter(t => t.category === category);
}

// Helper function to get templates by business type
export function getTemplatesByBusinessType(businessType: string): WorkflowTemplate[] {
  return workflowTemplates.filter(
    t => t.businessType === businessType || t.businessType === 'general'
  );
}

// Helper function to get templates by difficulty
export function getTemplatesByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): WorkflowTemplate[] {
  return workflowTemplates.filter(t => t.difficulty === difficulty);
}

// Get all unique categories
export function getCategories(): string[] {
  return Array.from(new Set(workflowTemplates.map(t => t.category)));
}
