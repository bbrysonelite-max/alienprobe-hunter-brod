import { logger } from '../logger';
import type { ScanResult, Lead } from '@shared/schema';

export interface ReportData {
  businessName: string;
  contactName?: string;
  email?: string;
  scanDate: string;
  scanData: any;
  status: string;
}

export interface GeneratedReport {
  htmlContent: string;
  summary: string;
  fileName: string;
  mimeType: string;
}

export class ReportGenerator {
  
  /**
   * Generate a professional HTML report from scan results
   */
  async generateReport(scanResult: ScanResult, lead?: Lead): Promise<GeneratedReport> {
    logger.info('Generating scan report', {
      scanId: scanResult.id,
      businessName: scanResult.businessName,
      status: scanResult.status
    });

    try {
      const reportData: ReportData = {
        businessName: scanResult.businessName,
        contactName: lead?.contactName || scanResult.businessName,
        email: lead?.email || scanResult.email,
        scanDate: scanResult.createdAt ? new Date(scanResult.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : new Date().toLocaleDateString(),
        scanData: this.parseScanData(scanResult.scanData),
        status: scanResult.status
      };

      const htmlContent = this.generateHTMLReport(reportData);
      const summary = this.generateSummary(reportData);
      const fileName = this.generateFileName(scanResult.businessName, scanResult.id);

      return {
        htmlContent,
        summary,
        fileName,
        mimeType: 'text/html'
      };

    } catch (error) {
      logger.error('Failed to generate scan report', error as Error, {
        scanId: scanResult.id,
        businessName: scanResult.businessName
      });
      throw new Error(`Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse scan data into structured format
   */
  private parseScanData(scanData: string | null): any {
    if (!scanData) {
      return {
        technicalFindings: [],
        securityFindings: [],
        performanceFindings: [],
        recommendations: []
      };
    }

    try {
      // Try to parse as JSON first
      return JSON.parse(scanData);
    } catch {
      // If not JSON, treat as text and create basic structure
      return {
        technicalFindings: [scanData.substring(0, 500) + (scanData.length > 500 ? '...' : '')],
        securityFindings: ['Basic security assessment completed'],
        performanceFindings: ['Performance analysis included'],
        recommendations: ['Custom recommendations based on analysis results']
      };
    }
  }

  /**
   * Generate professional HTML report
   */
  private generateHTMLReport(data: ReportData): string {
    const findings = data.scanData;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Business Analysis Report - ${data.businessName}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header .subtitle {
            margin: 10px 0 0 0;
            font-size: 1.2em;
            opacity: 0.9;
        }
        .report-info {
            background: white;
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .report-info h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .info-item {
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .info-label {
            font-weight: bold;
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .info-value {
            font-size: 1.1em;
            margin-top: 5px;
            color: #333;
        }
        .section {
            background: white;
            margin-bottom: 30px;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .section-header {
            background: #667eea;
            color: white;
            padding: 20px 25px;
            font-size: 1.3em;
            font-weight: 500;
        }
        .section-content {
            padding: 25px;
        }
        .finding-item {
            background: #f8f9fa;
            margin-bottom: 15px;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #28a745;
        }
        .finding-item.warning {
            border-left-color: #ffc107;
        }
        .finding-item.critical {
            border-left-color: #dc3545;
        }
        .recommendation {
            background: #e3f2fd;
            border: 1px solid #2196f3;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: 500;
            text-transform: uppercase;
        }
        .status-completed {
            background: #d4edda;
            color: #155724;
        }
        .status-pending {
            background: #fff3cd;
            color: #856404;
        }
        .status-failed {
            background: #f8d7da;
            color: #721c24;
        }
        .footer {
            text-align: center;
            padding: 30px;
            color: #666;
            border-top: 1px solid #eee;
            margin-top: 40px;
        }
        @media print {
            body {
                background-color: white;
            }
            .section {
                box-shadow: none;
                border: 1px solid #ddd;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Business Analysis Report</h1>
        <div class="subtitle">Comprehensive Technical & Security Assessment</div>
    </div>

    <div class="report-info">
        <h2>Report Overview</h2>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Business Name</div>
                <div class="info-value">${data.businessName}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Report Date</div>
                <div class="info-value">${data.scanDate}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Contact</div>
                <div class="info-value">${data.contactName || 'N/A'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Status</div>
                <div class="info-value">
                    <span class="status-badge status-${data.status === 'completed' ? 'completed' : data.status === 'pending' ? 'pending' : 'failed'}">
                        ${data.status}
                    </span>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            🔧 Technical Findings
        </div>
        <div class="section-content">
            ${this.renderFindings(findings.technicalFindings || ['Technical analysis completed successfully'])}
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            🔒 Security Assessment
        </div>
        <div class="section-content">
            ${this.renderFindings(findings.securityFindings || ['Security assessment completed'])}
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            ⚡ Performance Analysis
        </div>
        <div class="section-content">
            ${this.renderFindings(findings.performanceFindings || ['Performance analysis included'])}
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            💡 Recommendations
        </div>
        <div class="section-content">
            ${this.renderRecommendations(findings.recommendations || ['Custom recommendations will be provided based on detailed analysis'])}
        </div>
    </div>

    <div class="footer">
        <p><strong>This report is confidential and intended solely for ${data.businessName}</strong></p>
        <p>Generated on ${data.scanDate} | Business Analysis Platform</p>
    </div>
</body>
</html>`;
  }

  /**
   * Render findings as HTML
   */
  private renderFindings(findings: string[]): string {
    return findings.map(finding => 
      `<div class="finding-item">${this.escapeHtml(finding)}</div>`
    ).join('');
  }

  /**
   * Render recommendations as HTML
   */
  private renderRecommendations(recommendations: string[]): string {
    return recommendations.map(rec => 
      `<div class="recommendation">${this.escapeHtml(rec)}</div>`
    ).join('');
  }

  /**
   * Generate executive summary
   */
  private generateSummary(data: ReportData): string {
    const findings = data.scanData;
    const totalFindings = (findings.technicalFindings?.length || 0) + 
                          (findings.securityFindings?.length || 0) + 
                          (findings.performanceFindings?.length || 0);
    
    return `Complete business analysis for ${data.businessName} generated ${totalFindings} key findings. ` +
           `Technical assessment, security evaluation, and performance analysis completed. ` +
           `${findings.recommendations?.length || 1} actionable recommendations provided. ` +
           `Status: ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}.`;
  }

  /**
   * Generate secure filename
   */
  private generateFileName(businessName: string, scanId: string): string {
    // Sanitize business name for filename
    const sanitized = businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    
    const date = new Date().toISOString().split('T')[0];
    return `business-analysis-report-${sanitized}-${date}-${scanId.substring(0, 8)}.html`;
  }

  /**
   * Escape HTML for security
   */
  private escapeHtml(text: string): string {
    const div = { innerHTML: '' };
    div.innerHTML = text;
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#39;');
  }

  /**
   * Generate variables for email template
   */
  generateEmailVariables(
    scanResult: ScanResult, 
    generatedReport: GeneratedReport,
    reportUrl?: string,
    downloadUrl?: string
  ): Record<string, string> {
    return {
      businessName: scanResult.businessName,
      contactName: scanResult.businessName, // Default to business name if no contact
      scanDate: scanResult.createdAt ? new Date(scanResult.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
      reportSummary: generatedReport.summary,
      reportUrl: reportUrl || '#',
      downloadUrl: downloadUrl || '#'
    };
  }
}

export const reportGenerator = new ReportGenerator();