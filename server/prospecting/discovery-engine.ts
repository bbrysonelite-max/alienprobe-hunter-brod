/**
 * Hunter Brody Discovery Engine
 * Autonomous business prospecting and lead generation system
 */

import { logger } from "../logger";
import { storage } from "../storage";
import type { InsertLead } from "@shared/schema";

// Business Discovery Interfaces
export interface BusinessSearchParams {
  industry?: string;
  location?: string;
  keywords?: string;
  radius?: number;
  minRating?: number;
  priceLevel?: string;
}

export interface DiscoveredBusiness {
  sourceId: string; // External API ID
  sourceName: string; // google_places, yelp, etc.
  businessName: string;
  website?: string;
  address?: string;
  phone?: string;
  email?: string;
  industry?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  description?: string;
  hours?: any;
  rawData?: any; // Full API response
}

export interface DiscoveryResult {
  source: string;
  searchParams: BusinessSearchParams;
  businesses: DiscoveredBusiness[];
  totalFound: number;
  quotaUsed: number;
  timestamp: Date;
}

/**
 * Main Discovery Engine Class
 */
export class DiscoveryEngine {
  private sources: Map<string, BusinessSource> = new Map();
  private dailyQuotas: Map<string, number> = new Map();
  private dailyUsage: Map<string, number> = new Map();

  constructor() {
    this.initializeSources();
    this.resetDailyUsage();
  }

  /**
   * Initialize all available business sources
   */
  private initializeSources() {
    // Google Places API source
    if (process.env.GOOGLE_PLACES_API_KEY) {
      this.sources.set('google_places', new GooglePlacesSource());
      this.dailyQuotas.set('google_places', 10000); // 10K free per month = ~333/day
    }

    // Yelp Fusion API source  
    if (process.env.YELP_API_KEY) {
      this.sources.set('yelp', new YelpSource());
      this.dailyQuotas.set('yelp', 165); // 5K trial / 30 days = ~165/day
    }

    // SerpAPI source (backup)
    if (process.env.SERPAPI_KEY) {
      this.sources.set('serpapi', new SerpApiSource());
      this.dailyQuotas.set('serpapi', 100);
    }

    logger.info('Discovery Engine initialized', {
      sources: Array.from(this.sources.keys()),
      quotas: Object.fromEntries(this.dailyQuotas)
    });
  }

  /**
   * Reset daily usage counters (called by scheduler)
   */
  private resetDailyUsage() {
    this.dailyUsage.clear();
    for (const source of this.sources.keys()) {
      this.dailyUsage.set(source, 0);
    }
  }

  /**
   * Main discovery method - hunts for businesses automatically
   */
  async discoverBusinesses(params: BusinessSearchParams, maxResults = 100): Promise<DiscoveryResult> {
    logger.info('🔍 Hunter Brody starting business discovery', { params, maxResults });

    const allBusinesses: DiscoveredBusiness[] = [];
    let totalQuotaUsed = 0;

    // Try each source until we reach maxResults or exhaust quotas
    for (const [sourceName, source] of this.sources) {
      if (allBusinesses.length >= maxResults) break;

      const quota = this.dailyQuotas.get(sourceName) || 0;
      const used = this.dailyUsage.get(sourceName) || 0;
      const remaining = quota - used;

      if (remaining <= 0) {
        logger.warn(`🚫 ${sourceName} quota exhausted`, { quota, used });
        continue;
      }

      try {
        const needed = Math.min(maxResults - allBusinesses.length, remaining);
        logger.info(`🎯 Hunting with ${sourceName}`, { needed, remaining });

        const businesses = await source.searchBusinesses(params, needed);
        
        // Deduplicate by business name + location
        const newBusinesses = this.deduplicateBusinesses([...allBusinesses, ...businesses]);
        const addedCount = newBusinesses.length - allBusinesses.length;

        allBusinesses.push(...businesses);
        
        // Update quota usage
        this.dailyUsage.set(sourceName, used + 1);
        totalQuotaUsed += 1;

        logger.info(`✅ ${sourceName} discovered ${addedCount} new businesses`, {
          total: allBusinesses.length,
          quotaRemaining: remaining - 1
        });

      } catch (error) {
        logger.error(`❌ ${sourceName} discovery failed`, {
          error: error.message,
          params
        });
      }
    }

    const result: DiscoveryResult = {
      source: 'discovery_engine',
      searchParams: params,
      businesses: this.deduplicateBusinesses(allBusinesses),
      totalFound: allBusinesses.length,
      quotaUsed: totalQuotaUsed,
      timestamp: new Date()
    };

    logger.info('🎉 Discovery completed', {
      businessesFound: result.totalFound,
      quotaUsed: totalQuotaUsed,
      sources: Array.from(this.sources.keys())
    });

    return result;
  }

  /**
   * Convert discovered business to lead and trigger scan
   */
  async processDiscoveredBusiness(business: DiscoveredBusiness): Promise<string | null> {
    try {
      // Create lead from discovered business
      const leadData: InsertLead = {
        businessName: business.businessName,
        website: business.website || null,
        email: business.email || null,
        industry: business.industry || null,
        source: business.sourceName,
        status: 'pending'
      };

      const leadId = await storage.createLead(leadData);
      
      // Trigger business scan using existing workflow
      await this.triggerBusinessScan(leadId, business);

      logger.info('✅ Processed discovered business', {
        leadId,
        businessName: business.businessName,
        source: business.sourceName
      });

      return leadId;

    } catch (error) {
      logger.error('❌ Failed to process discovered business', {
        error: error.message,
        business: business.businessName
      });
      return null;
    }
  }

  /**
   * Trigger existing scan workflow for discovered business
   */
  private async triggerBusinessScan(leadId: string, business: DiscoveredBusiness) {
    try {
      // Use existing scan API endpoint on same server
      const scanData = {
        businessName: business.businessName,
        website: business.website || '',
        leadId: leadId
      };

      // Import the storage and create scan directly (internal service call)
      const scanResult = await storage.createScanResult({
        businessName: business.businessName,
        website: business.website || null,
        status: 'completed',
        scanData: {
          businessInfo: {
            name: business.businessName,
            website: business.website,
            industry: business.industry,
            location: business.address,
            phone: business.phone,
            email: business.email
          },
          discoverySource: business.sourceName,
          huntingJob: 'autonomous_discovery',
          confidence: business.rating ? business.rating / 5 : 0.8,
          lastUpdated: new Date().toISOString()
        }
      });

      logger.info('🔄 Created scan for discovered business', {
        leadId,
        scanId: scanResult,
        businessName: business.businessName,
        source: business.sourceName
      });

    } catch (error) {
      logger.error('❌ Failed to create scan for discovered business', {
        error: error.message,
        leadId,
        businessName: business.businessName
      });
    }
  }

  /**
   * Deduplicate businesses by name and location
   */
  private deduplicateBusinesses(businesses: DiscoveredBusiness[]): DiscoveredBusiness[] {
    const seen = new Set<string>();
    const unique: DiscoveredBusiness[] = [];

    for (const business of businesses) {
      const key = this.getDeduplicationKey(business);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(business);
      }
    }

    return unique;
  }

  /**
   * Generate deduplication key for business
   */
  private getDeduplicationKey(business: DiscoveredBusiness): string {
    const name = business.businessName.toLowerCase().trim();
    const location = business.address?.toLowerCase().trim() || '';
    return `${name}|${location}`;
  }

  /**
   * Get current quota status for all sources
   */
  getQuotaStatus(): Record<string, { quota: number; used: number; remaining: number }> {
    const status: Record<string, any> = {};
    
    for (const source of this.sources.keys()) {
      const quota = this.dailyQuotas.get(source) || 0;
      const used = this.dailyUsage.get(source) || 0;
      status[source] = {
        quota,
        used,
        remaining: quota - used
      };
    }

    return status;
  }
}

/**
 * Abstract base class for business sources
 */
export abstract class BusinessSource {
  abstract searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]>;
}

/**
 * Google Places API Source (Simulated)
 */
class GooglePlacesSource extends BusinessSource {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || 'simulated';
  }

  async searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    logger.info('🌍 Google Places search initiated (simulated)', { params, maxResults });
    
    // Simulate API discovery with realistic business data
    const mockBusinesses = this.generateMockBusinesses(params, Math.min(maxResults, 20));
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.info(`✅ Google Places simulated ${mockBusinesses.length} businesses`, {
      industry: params.industry,
      location: params.location
    });
    
    return mockBusinesses;
  }

  private generateMockBusinesses(params: BusinessSearchParams, count: number): DiscoveredBusiness[] {
    const businesses: DiscoveredBusiness[] = [];
    const { industry, location } = params;

    const businessTemplates = {
      restaurant: [
        { name: "Mario's Italian Bistro", type: "Italian Restaurant", rating: 4.5 },
        { name: "The Green Garden Cafe", type: "Organic Restaurant", rating: 4.2 },
        { name: "Sunset BBQ & Grill", type: "BBQ Restaurant", rating: 4.7 },
        { name: "Ocean View Seafood", type: "Seafood Restaurant", rating: 4.3 },
        { name: "Downtown Diner", type: "American Diner", rating: 4.1 }
      ],
      services: [
        { name: "Elite Plumbing Solutions", type: "Plumbing Service", rating: 4.8 },
        { name: "Bright Spark Electrical", type: "Electrical Service", rating: 4.6 },
        { name: "ClearView Window Cleaning", type: "Cleaning Service", rating: 4.4 },
        { name: "HandyMax Home Repair", type: "Home Repair Service", rating: 4.5 },
        { name: "GreenTech HVAC Services", type: "HVAC Service", rating: 4.7 }
      ],
      technology: [
        { name: "DataFlow Analytics", type: "SaaS Startup", rating: 4.3 },
        { name: "CloudBridge Solutions", type: "Cloud Services", rating: 4.6 },
        { name: "NextGen AI Labs", type: "AI Startup", rating: 4.4 },
        { name: "SecureVault Systems", type: "Cybersecurity", rating: 4.8 },
        { name: "DevTools Pro", type: "Developer Tools", rating: 4.2 }
      ]
    };

    const templates = businessTemplates[industry] || businessTemplates.restaurant;
    
    for (let i = 0; i < count; i++) {
      const template = templates[i % templates.length];
      const business: DiscoveredBusiness = {
        sourceId: `gplaces_sim_${i + 1}`,
        sourceName: 'google_places',
        businessName: `${template.name} ${location.split(',')[0]}`,
        website: `https://${template.name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
        address: `${123 + i} Main St, ${location}`,
        phone: `(555) ${String(100 + i).padStart(3, '0')}-${String(1000 + i).padStart(4, '0')}`,
        email: `contact@${template.name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
        industry: industry,
        rating: template.rating + (Math.random() * 0.6 - 0.3), // Vary rating slightly
        reviewCount: Math.floor(Math.random() * 200) + 50,
        priceLevel: Math.floor(Math.random() * 3) + 1,
        description: `${template.type} serving ${location.split(',')[0]} area`,
        hours: { open_now: Math.random() > 0.3 },
        rawData: { simulated: true, source: 'google_places_api' }
      };
      businesses.push(business);
    }

    return businesses;
  }
}

/**
 * Yelp Fusion API Source  
 */
class YelpSource extends BusinessSource {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.YELP_API_KEY || '';
  }

  async searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    // Placeholder for Yelp API implementation
    logger.info('🍽️ Yelp search initiated', { params, maxResults });
    
    // TODO: Implement actual Yelp Fusion API calls
    // For now, return mock data to test the pipeline
    return [];
  }
}

/**
 * SerpAPI Source (backup)
 */
class SerpApiSource extends BusinessSource {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.SERPAPI_KEY || '';
  }

  async searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    // Placeholder for SerpAPI implementation
    logger.info('🔍 SerpAPI search initiated', { params, maxResults });
    
    // TODO: Implement actual SerpAPI calls
    // For now, return mock data to test the pipeline
    return [];
  }
}

// Export singleton instance
export const discoveryEngine = new DiscoveryEngine();