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
      // Use existing scan API endpoint
      const scanData = {
        businessName: business.businessName,
        website: business.website || '',
        leadId: leadId
      };

      // This will trigger the existing scan workflow
      const response = await fetch('http://localhost:5000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanData)
      });

      if (response.ok) {
        const result = await response.json();
        logger.info('🔄 Triggered scan for discovered business', {
          leadId,
          scanId: result.scanId,
          businessName: business.businessName
        });
      }

    } catch (error) {
      logger.error('❌ Failed to trigger business scan', {
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
 * Google Places API Source
 */
class GooglePlacesSource extends BusinessSource {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }

  async searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    // Placeholder for Google Places API implementation
    logger.info('🌍 Google Places search initiated', { params, maxResults });
    
    // TODO: Implement actual Google Places API calls
    // For now, return mock data to test the pipeline
    return [];
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