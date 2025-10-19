# AlienProbe.ai - Product Instructions

**Welcome to AlienProbe.ai, your autonomous business optimization platform powered by Hunter Brody.**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Admin Dashboard](#admin-dashboard)
3. [Workflow Templates](#workflow-templates)
4. [Real-time Activity Monitoring](#real-time-activity-monitoring)
5. [Email Automation](#email-automation)
6. [Business Scanning](#business-scanning)
7. [Best Practices](#best-practices)

---

## Getting Started

### Accessing the Platform

1. **Navigate to your AlienProbe.ai dashboard** in your web browser
2. **Log in** with your credentials (authentication required for admin features)
3. The main navigation bar provides access to:
   - **Home** - Business scanning and AI chat
   - **Results** - View all scan results
   - **Workflows** - Manage automation workflows
   - **Admin** - System administration (requires admin access)

---

## Admin Dashboard

**Access:** Click "Admin" in the main navigation (requires system monitoring permissions)

### Dashboard Overview

The admin dashboard provides 5 key sections:

#### 1. **Dashboard Tab** - System Overview
- **Real-time Metrics**
  - Active hunts and scan counts
  - Email delivery statistics
  - System health indicators
  - Revenue tracking

- **Quick Actions**
  - **Restart Hunters** - Restart the automated lead discovery system
  - **Clean Failed Hunts** - Remove failed hunt records
  - **Clean Old Scans** - Archive scans older than 30 days

- **Revenue Overview**
  - Scan revenue ($49.99 per scan)
  - Monthly commission estimates (15% on tool recommendations)
  - Total revenue potential per business

#### 2. **Pricing Management**
- View current scan pricing ($49.99 default)
- Update pricing for different plan tiers
- Manage Stripe integration settings
- Track pricing history

**How to Update Pricing:**
1. Click the "Edit" button next to the plan
2. Enter new price (in cents, e.g., 4999 = $49.99)
3. Click "Update" to save changes

#### 3. **System Settings**
- Toggle feature flags on/off
- Configure system-wide settings
- Manage automation preferences

**Available Settings:**
- Email notifications
- Workflow automation
- Lead discovery features
- System maintenance modes

#### 4. **Activity Feed** - Real-time Monitoring
- **Live event stream** showing:
  - Lead discoveries
  - Business scans (started, completed, failed)
  - Email deliveries
  - Workflow executions
  - System events

- Events update automatically every 2 seconds
- Color-coded status indicators:
  - 🟢 Green = Success
  - 🔴 Red = Error
  - 🟡 Yellow = Warning
  - 🔵 Blue = Info

#### 5. **Email Automation**
- Send business scan reports via email
- View email delivery history
- Track email success/failure rates

**How to Send a Scan Report:**
1. Enter the Scan ID (from your results page)
2. Enter recipient email address
3. Click "Send Email Report"
4. System automatically formats and sends the report

---

## Workflow Templates

**Access:** Navigate to "Workflows" → "Templates" tab

### What are Workflow Templates?

Pre-built automation blueprints that help you set up common business tasks quickly. Each template includes:
- Complete workflow definition
- Step-by-step setup instructions
- Estimated setup time
- Difficulty level (Beginner/Intermediate/Advanced)
- Expected benefits

### Available Templates

#### 1. **Basic Lead Discovery** (Beginner - 5 min)
**Use when:** You want to automatically find new business prospects

**What it does:**
- Searches for businesses matching your criteria
- Scores and qualifies leads automatically
- Sends email notifications for qualified prospects

**Benefits:**
- 24/7 automated lead discovery
- Saves 10+ hours per week
- Consistent qualification criteria

#### 2. **Business Scan & Follow-up** (Beginner - 3 min)
**Use when:** You want to analyze a business and send personalized insights

**What it does:**
- Scans a business for insights
- Waits for scan completion
- Automatically emails results to prospect

**Benefits:**
- Personalized outreach at scale
- Improved response rates
- Consistent follow-up process

#### 3. **Daily Lead Hunt** (Intermediate - 10 min)
**Use when:** You need a scheduled daily workflow for pipeline growth

**What it does:**
- Searches multiple sources daily
- Enriches lead data automatically
- Updates your CRM
- Sends daily summary reports

**Benefits:**
- Daily pipeline growth
- Automated CRM updates
- 15+ hours saved per week

#### 4. **Restaurant Performance Optimizer** (Advanced - 15 min)
**Use when:** Analyzing restaurant operations and performance

**What it does:**
- Analyzes menu performance
- Reviews customer sentiment
- Compares with competitors
- Generates optimization recommendations

**Benefits:**
- Data-driven insights
- Menu and pricing optimization
- Operational efficiency improvements

### How to Use a Template

1. **Browse Templates**
   - Click "Workflows" in navigation
   - Select "Templates" tab
   - Browse by category, difficulty, or business type

2. **View Template Details**
   - Click "View Details" on any template
   - Read the complete instructions
   - Review the workflow structure
   - Check benefits and requirements

3. **Deploy a Template**
   - Click "Use Template" button
   - The system will guide you through customization
   - Review and activate your workflow

4. **Download Template** (Optional)
   - Click "Download" to save template as JSON
   - Use for backup or custom modifications

---

## Real-time Activity Monitoring

### Activity Feed Features

**Automatic Updates:**
- Events stream in real-time (every 2 seconds)
- No page refresh needed
- Most recent events appear at the top

**Event Types:**
- 🎯 **Lead** - Lead discovery and qualification events
- 📊 **Scan** - Business scan progress and completion
- 📧 **Email** - Email sending and delivery status
- ⚙️ **Workflow** - Workflow execution updates
- 🖥️ **System** - Platform health and maintenance

**Event Information:**
Each event shows:
- Event type and status
- Descriptive message
- Timestamp
- Related business/reference ID

### Using the Activity Feed

1. **Monitor System Health**
   - Watch for error events (red badges)
   - Track success rates
   - Identify bottlenecks

2. **Track Specific Operations**
   - Look for your scan ID or lead ID
   - Follow the progress of specific tasks
   - Verify email deliveries

3. **Performance Optimization**
   - Review event patterns
   - Identify peak usage times
   - Spot recurring issues

---

## Email Automation

### Automated Scan Reports

The system can automatically send formatted business scan reports to prospects or clients.

**Report Includes:**
- Business name and overview
- Scan analysis results
- Hunter Brody branding
- Professional HTML formatting

### Sending Reports

**Method 1: Via Admin Dashboard**
1. Go to Admin → Email Automation tab
2. Enter Scan ID
3. Enter recipient email
4. Click "Send Email Report"

**Method 2: Via Workflows**
- Set up workflow with email notification step
- Configure recipient and template
- Workflow sends automatically when triggered

### Email Tracking

View sent emails:
- Delivery status (sent/failed/bounced)
- Send timestamp
- Provider message ID
- Error messages (if failed)

---

## Business Scanning

### How to Scan a Business

1. **Navigate to Home Page**
2. **Enter Business Information:**
   - Business name (required)
   - Website URL (optional but recommended)
   - Business type (select from dropdown)

3. **Select Scan Type:**
   - **Basic Scan** - Quick overview
   - **Pro Analysis** - Detailed insights
   - **Premium Report** - Comprehensive analysis

4. **Submit Scan**
   - Click "Scan Business"
   - System processes in background
   - Results appear in real-time

### Viewing Scan Results

1. **Results Page**
   - Access via "Results" in navigation
   - See all your scan history
   - Filter by status or business type

2. **Individual Scan Details**
   - Click on any scan to view full results
   - See scan status, timeline, and data
   - Export or share results

---

## Best Practices

### For Maximum Efficiency

1. **Start with Templates**
   - Don't build workflows from scratch
   - Use beginner templates first
   - Customize as you learn

2. **Monitor the Activity Feed**
   - Check daily for system health
   - Address errors promptly
   - Track automation performance

3. **Automate Email Follow-ups**
   - Set up scan + email workflows
   - Personalize templates for your business
   - Track response rates

4. **Keep Pricing Updated**
   - Review pricing quarterly
   - Adjust based on market conditions
   - Track revenue metrics

### Workflow Best Practices

1. **Test Before Deploying**
   - Start with small batches
   - Verify results are accurate
   - Adjust criteria as needed

2. **Set Realistic Targets**
   - Don't overload the system
   - Start with daily limits
   - Scale up gradually

3. **Review Results Regularly**
   - Weekly workflow performance reviews
   - Monthly strategy adjustments
   - Quarterly system audits

### Email Best Practices

1. **Timing**
   - Send during business hours
   - Avoid weekends for B2B
   - Test different send times

2. **Content**
   - Keep reports concise
   - Highlight key insights first
   - Include clear next steps

3. **Follow-up**
   - Don't spam recipients
   - Space emails appropriately
   - Track engagement metrics

---

## Common Tasks Quick Reference

| Task | Navigation Path | Time |
|------|----------------|------|
| Scan a business | Home → Enter details → Scan | 1 min |
| View scan results | Results → Click scan | 30 sec |
| Send email report | Admin → Email → Enter details | 1 min |
| Use workflow template | Workflows → Templates → Use Template | 3-15 min |
| Monitor activity | Admin → Activity Feed | Ongoing |
| Update pricing | Admin → Pricing → Edit → Update | 2 min |
| Toggle features | Admin → Settings → Toggle switch | 30 sec |

---

## Support & Troubleshooting

### Common Issues

**Problem: Scan is stuck in "pending" status**
- Solution: Check Activity Feed for errors
- Action: Use "Restart Hunters" in Admin Dashboard

**Problem: Email not sending**
- Solution: Verify recipient email format
- Check: Activity Feed for email error events

**Problem: Workflow not starting**
- Solution: Verify workflow is published
- Check: System Settings are enabled

### Getting Help

For additional support:
1. Check the Activity Feed for error details
2. Review this documentation
3. Contact your system administrator

---

## Security Notes

- Admin features require proper authentication
- All admin routes are protected
- Email content is validated before sending
- Activity events are logged for audit purposes
- System settings changes are tracked

---

## Updates & Maintenance

The platform updates automatically. Key features:
- Real-time activity monitoring
- Automated workflow execution
- Background scan processing
- Email queue management
- Health check endpoints

**Last Updated:** October 18, 2025
**Platform Version:** Hunter Brody Autonomous Platform v1.0
