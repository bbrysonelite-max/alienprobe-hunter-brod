/**
 * AlienProbe.ai Tool Recommendation Engine
 * Analyzes scanned businesses and recommends AI optimization tools
 */

import { logger } from "../logger";
import { db } from "../db";
import { businessTools, toolCategories, toolRecommendations, leads, scanResults } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface BusinessProfile {
  industry: string;
  businessSize?: string;
  revenue?: string;
  painPoints?: string[];
  currentTools?: string[];
  website?: string;
  location?: string;
}

export interface ToolRecommendation {
  tool: any;
  score: number;
  reasons: string[];
  matchingCriteria: any;
  category: string;
}

/**
 * AI-powered tool recommendation engine for business optimization
 */
export class RecommendationEngine {
  
  /**
   * Generate tool recommendations for a business based on scan results
   */
  async generateRecommendations(
    leadId: string, 
    scanId?: string,
    context: string = 'scan_results'
  ): Promise<ToolRecommendation[]> {
    
    logger.info('🎯 Generating tool recommendations', { leadId, scanId, context });

    // Get business profile from lead and scan data
    const profile = await this.buildBusinessProfile(leadId, scanId);
    
    // Get available tools
    const availableTools = await this.getAvailableTools();
    
    // Score and rank tools for this business
    const recommendations = await this.scoreTools(profile, availableTools);
    
    // Store recommendations in database (skip for demo leads)
    if (!leadId.startsWith('lead_')) {
      await this.storeRecommendations(leadId, scanId, recommendations, context);
    }
    
    logger.info('✅ Tool recommendations generated', {
      leadId,
      toolCount: recommendations.length,
      topRecommendation: recommendations[0]?.tool.name
    });

    return recommendations;
  }

  /**
   * Build business profile from lead and scan data
   */
  private async buildBusinessProfile(leadId: string, scanId?: string): Promise<BusinessProfile> {
    // Handle demo leads (simulated)
    if (leadId.startsWith('lead_')) {
      return {
        industry: 'automotive',
        businessSize: '1-10',
        revenue: '5k-25k',
        painPoints: ['Customer management', 'Online presence'],
        currentTools: ['Basic POS', 'Email'],
        website: null,
        location: 'Chicago, IL'
      };
    }
    
    // Get lead information from database
    const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (lead.length === 0) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const leadData = lead[0];
    
    // Get scan data if available
    let scanData: any = {};
    if (scanId) {
      const scan = await db.select().from(scanResults).where(eq(scanResults.id, scanId)).limit(1);
      if (scan.length > 0) {
        try {
          scanData = JSON.parse(scan[0].scanData || '{}');
        } catch (error) {
          logger.warn('Failed to parse scan data', { scanId, error });
        }
      }
    }

    return {
      industry: leadData.industry || this.inferIndustryFromBusiness(leadData.businessName),
      businessSize: leadData.companySize || this.estimateBusinessSize(leadData.businessName),
      revenue: leadData.budgetRange,
      painPoints: leadData.painPoints ? [leadData.painPoints] : this.inferPainPoints(leadData.industry),
      currentTools: scanData.detectedTools || [],
      website: leadData.website,
      location: scanData.location || 'Unknown'
    };
  }

  /**
   * Get available business tools from database
   */
  private async getAvailableTools(): Promise<any[]> {
    const tools = await db
      .select({
        tool: businessTools,
        category: toolCategories
      })
      .from(businessTools)
      .leftJoin(toolCategories, eq(businessTools.categoryId, toolCategories.id))
      .where(eq(businessTools.enabled, true))
      .orderBy(desc(businessTools.priority));

    return tools;
  }

  /**
   * Score tools based on business profile match
   */
  private async scoreTools(profile: BusinessProfile, tools: any[]): Promise<ToolRecommendation[]> {
    const scored: ToolRecommendation[] = [];

    for (const { tool, category } of tools) {
      const score = this.calculateMatchScore(profile, tool);
      if (score > 30) { // Minimum relevance threshold
        scored.push({
          tool,
          score,
          reasons: this.generateReasons(profile, tool),
          matchingCriteria: this.getMatchingCriteria(profile, tool),
          category: category?.name || 'Other'
        });
      }
    }

    // Sort by score descending and return top 10
    return scored.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Calculate match score between business profile and tool
   */
  private calculateMatchScore(profile: BusinessProfile, tool: any): number {
    let score = 0;

    // Industry match (40% weight)
    if (tool.targetIndustries?.includes(profile.industry)) {
      score += 40;
    } else if (this.isIndustryRelated(profile.industry, tool.targetIndustries || [])) {
      score += 20;
    }

    // Business size match (20% weight)
    if (tool.targetBusinessSize?.includes(profile.businessSize)) {
      score += 20;
    }

    // Pain point match (25% weight)
    const painPointMatch = this.matchPainPoints(profile.painPoints || [], tool.useCases || []);
    score += painPointMatch * 25;

    // Tool priority boost (10% weight)
    score += (tool.priority || 0) * 0.1;

    // Revenue appropriateness (5% weight)
    if (this.isRevenueAppropriate(profile.revenue, tool.pricing)) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Generate human-readable reasons for recommendation
   */
  private generateReasons(profile: BusinessProfile, tool: any): string[] {
    const reasons: string[] = [];

    if (tool.targetIndustries?.includes(profile.industry)) {
      reasons.push(`Perfect fit for ${profile.industry} businesses`);
    }

    if (tool.targetBusinessSize?.includes(profile.businessSize)) {
      reasons.push(`Designed for ${profile.businessSize} employee companies`);
    }

    if (tool.useCases?.some((useCase: string) => 
      profile.painPoints?.some(pain => pain.toLowerCase().includes(useCase.toLowerCase())))) {
      reasons.push(`Addresses your key challenges`);
    }

    if (tool.tags?.includes('popular')) {
      reasons.push('Popular choice among similar businesses');
    }

    if (tool.commissionRate && tool.commissionRate > 0) {
      reasons.push('Proven ROI and high customer satisfaction');
    }

    return reasons.slice(0, 3); // Top 3 reasons
  }

  /**
   * Store recommendations in database
   */
  private async storeRecommendations(
    leadId: string,
    scanId: string | undefined,
    recommendations: ToolRecommendation[],
    context: string
  ): Promise<void> {
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      
      await db.insert(toolRecommendations).values({
        leadId,
        scanId,
        toolId: rec.tool.id,
        recommendationScore: rec.score,
        reasonsShown: rec.reasons,
        matchingCriteria: rec.matchingCriteria,
        position: i + 1,
        context,
        status: 'generated'
      });
    }
  }

  // Helper methods
  private inferIndustryFromBusiness(businessName: string): string {
    const name = businessName.toLowerCase();
    if (name.includes('auto') || name.includes('car') || name.includes('garage')) return 'automotive';
    if (name.includes('restaurant') || name.includes('pizza') || name.includes('cafe')) return 'restaurant';
    if (name.includes('dental') || name.includes('dentist')) return 'healthcare';
    if (name.includes('salon') || name.includes('hair') || name.includes('beauty')) return 'personal_care';
    if (name.includes('plumb') || name.includes('electric') || name.includes('hvac')) return 'home_services';
    return 'services';
  }

  private estimateBusinessSize(businessName: string): string {
    // Simple heuristic - could be enhanced with real data
    return '1-10'; // Default for small local businesses
  }

  private inferPainPoints(industry?: string): string[] {
    const commonPains: { [key: string]: string[] } = {
      'restaurant': ['customer retention', 'inventory management', 'staff scheduling'],
      'automotive': ['appointment scheduling', 'parts ordering', 'customer communication'],
      'healthcare': ['patient scheduling', 'billing optimization', 'patient retention'],
      'personal_care': ['booking management', 'customer loyalty', 'inventory tracking'],
      'home_services': ['lead generation', 'scheduling optimization', 'customer follow-up']
    };
    
    return commonPains[industry || 'services'] || ['customer acquisition', 'operational efficiency'];
  }

  private isIndustryRelated(businessIndustry: string, toolIndustries: string[]): boolean {
    const related: { [key: string]: string[] } = {
      'restaurant': ['retail', 'hospitality', 'food_service'],
      'automotive': ['repair', 'services', 'maintenance'],
      'healthcare': ['medical', 'wellness', 'professional_services'],
      'personal_care': ['beauty', 'wellness', 'retail'],
      'home_services': ['construction', 'maintenance', 'repair']
    };
    
    const relatedIndustries = related[businessIndustry] || [];
    return toolIndustries.some(tool => relatedIndustries.includes(tool));
  }

  private matchPainPoints(businessPains: string[], toolUseCases: string[]): number {
    if (businessPains.length === 0 || toolUseCases.length === 0) return 0;
    
    let matches = 0;
    for (const pain of businessPains) {
      for (const useCase of toolUseCases) {
        if (pain.toLowerCase().includes(useCase.toLowerCase()) || 
            useCase.toLowerCase().includes(pain.toLowerCase())) {
          matches++;
          break;
        }
      }
    }
    
    return matches / businessPains.length;
  }

  private isRevenueAppropriate(businessRevenue?: string, toolPricing?: any): boolean {
    if (!businessRevenue || !toolPricing) return true;
    
    // Simple check - could be enhanced with real pricing logic
    const isLowBudget = businessRevenue === '<5k';
    const hasFreePlan = toolPricing.plan === 'free' || toolPricing.minPrice === 0;
    
    return !isLowBudget || hasFreePlan;
  }

  private getMatchingCriteria(profile: BusinessProfile, tool: any): any {
    return {
      industryMatch: tool.targetIndustries?.includes(profile.industry),
      sizeMatch: tool.targetBusinessSize?.includes(profile.businessSize),
      painPointScore: this.matchPainPoints(profile.painPoints || [], tool.useCases || []),
      revenueAppropriate: this.isRevenueAppropriate(profile.revenue, tool.pricing)
    };
  }
}

// Export singleton instance
export const recommendationEngine = new RecommendationEngine();