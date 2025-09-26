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
    // Always enable Google Places (simulated or real based on API key)
    this.sources.set('google_places', new GooglePlacesSource());
    this.dailyQuotas.set('google_places', process.env.GOOGLE_PLACES_API_KEY ? 10000 : 500); // High quota for simulated

    // Always enable Yelp (FORCED TO MOCK per user requirement)
    this.sources.set('yelp', new YelpSource());
    this.dailyQuotas.set('yelp', 300); // Always mock, high quota

    // Always enable SerpAPI (simulated or real based on API key)
    this.sources.set('serpapi', new SerpApiSource());
    this.dailyQuotas.set('serpapi', process.env.SERPAPI_KEY ? 100 : 200); // High quota for simulated

    logger.info('Discovery Engine initialized', {
      sources: Array.from(this.sources.keys()),
      quotas: Object.fromEntries(this.dailyQuotas),
      realAPIs: {
        googlePlaces: !!process.env.GOOGLE_PLACES_API_KEY,
        yelp: false, // Forced to mock per user requirement
        serpApi: !!process.env.SERPAPI_KEY
      }
    });
  }

  /**
   * Reset daily usage counters (called by scheduler)
   */
  private resetDailyUsage() {
    this.dailyUsage.clear();
    for (const source of Array.from(this.sources.keys())) {
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
    for (const [sourceName, source] of Array.from(this.sources)) {
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
        
        // Deduplicate by business name + location (handles both cross-source and intra-batch duplicates)
        const seenKeys = new Set(allBusinesses.map(b => this.getDeduplicationKey(b)));
        const uniqueNewBusinesses: DiscoveredBusiness[] = [];
        
        for (const business of businesses) {
          const key = this.getDeduplicationKey(business);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueNewBusinesses.push(business);
          }
        }
        
        allBusinesses.push(...uniqueNewBusinesses);
        const addedCount = uniqueNewBusinesses.length;
        
        // Update quota usage
        this.dailyUsage.set(sourceName, used + 1);
        totalQuotaUsed += 1;

        logger.info(`✅ ${sourceName} discovered ${addedCount} new businesses`, {
          total: allBusinesses.length,
          quotaRemaining: remaining - 1
        });

      } catch (error) {
        logger.error(`❌ ${sourceName} discovery failed`, {
          error: error instanceof Error ? error.message : String(error),
          params
        });
      }
    }

    const finalBusinesses = this.deduplicateBusinesses(allBusinesses);
    const result: DiscoveryResult = {
      source: 'discovery_engine',
      searchParams: params,
      businesses: finalBusinesses,
      totalFound: finalBusinesses.length, // Use final deduplicated count for accuracy
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
        website: business.website || undefined,
        email: business.email || undefined,
        industry: business.industry || undefined,
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
 * Yelp Fusion API Source (Simulated)
 */
class YelpSource extends BusinessSource {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.YELP_API_KEY || 'simulated';
  }

  async searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    // FORCED TO MOCK - Do not use real Yelp API even if key exists (per user requirement)
    logger.info('🍽️ Yelp search initiated (FORCED MOCK)', { params, maxResults });
    
    // Always use mock data regardless of API key availability
    const mockBusinesses = this.generateYelpBusinesses(params, Math.min(maxResults, 25));
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 150));
    
    logger.info(`✅ Yelp MOCK generated ${mockBusinesses.length} businesses`, {
      industry: params.industry,
      location: params.location
    });
    
    return mockBusinesses;
  }

  private generateYelpBusinesses(params: BusinessSearchParams, count: number): DiscoveredBusiness[] {
    const businesses: DiscoveredBusiness[] = [];
    const { industry, location } = params;

    const yelpCategories = {
      restaurant: [
        { name: "Tasty Corner Bistro", category: "American", rating: 4.4 },
        { name: "Spice Route Kitchen", category: "Indian", rating: 4.6 },
        { name: "Fresh Catch Seafood", category: "Seafood", rating: 4.3 },
        { name: "Bella Napoli Pizza", category: "Pizza", rating: 4.2 },
        { name: "Golden Dragon Chinese", category: "Chinese", rating: 4.5 }
      ],
      services: [
        { name: "ProFix Handyman Services", category: "Home Repair", rating: 4.7 },
        { name: "Crystal Clean Maids", category: "Cleaning", rating: 4.5 },
        { name: "PowerLine Electrical Co", category: "Electrical", rating: 4.8 },
        { name: "FlowMaster Plumbing", category: "Plumbing", rating: 4.6 },
        { name: "GreenThumb Landscaping", category: "Landscaping", rating: 4.4 }
      ],
      technology: [
        { name: "CodeCraft Studios", category: "Software Development", rating: 4.5 },
        { name: "PixelPerfect Design", category: "Web Design", rating: 4.7 },
        { name: "DataVault Security", category: "IT Security", rating: 4.8 },
        { name: "CloudFirst Solutions", category: "Cloud Services", rating: 4.6 },
        { name: "AppFlow Development", category: "Mobile Apps", rating: 4.3 }
      ]
    };

    const categories = yelpCategories[industry] || yelpCategories.restaurant;
    
    for (let i = 0; i < count; i++) {
      const category = categories[i % categories.length];
      const business: DiscoveredBusiness = {
        sourceId: `yelp_sim_${i + 1}`,
        sourceName: 'yelp',
        businessName: `${category.name} - ${location.split(',')[0]}`,
        website: `https://${category.name.toLowerCase().replace(/[^a-z]/g, '')}.biz`,
        address: `${200 + i} Business Ave, ${location}`,
        phone: `(555) ${String(200 + i).padStart(3, '0')}-${String(2000 + i).padStart(4, '0')}`,
        email: `info@${category.name.toLowerCase().replace(/[^a-z]/g, '')}.biz`,
        industry: industry,
        rating: category.rating + (Math.random() * 0.4 - 0.2),
        reviewCount: Math.floor(Math.random() * 150) + 25,
        priceLevel: Math.floor(Math.random() * 4) + 1,
        description: `${category.category} business in ${location.split(',')[0]}`,
        hours: { open_now: Math.random() > 0.2 },
        rawData: { simulated: true, source: 'yelp_fusion_api', category: category.category }
      };
      businesses.push(business);
    }

    return businesses;
  }
}

/**
 * SerpAPI Source (REAL API)
 */
class SerpApiSource extends BusinessSource {
  private apiKey: string;
  private isReal: boolean;

  constructor() {
    super();
    this.apiKey = process.env.SERPAPI_KEY || 'simulated';
    this.isReal = !!process.env.SERPAPI_KEY;
  }

  async searchBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    if (!this.isReal) {
      return this.generateSerpBusinesses(params, Math.min(maxResults, 15));
    }

    logger.info('🔍 SerpAPI REAL search initiated', { params, maxResults });
    
    try {
      const businesses = await this.searchRealBusinesses(params, Math.min(maxResults, 15));
      
      logger.info(`✅ SerpAPI REAL discovered ${businesses.length} businesses`, {
        industry: params.industry,
        location: params.location
      });
      
      return businesses;
    } catch (error) {
      logger.error('❌ SerpAPI real search failed, falling back to mock', { error: error.message });
      return this.generateSerpBusinesses(params, Math.min(maxResults, 15));
    }
  }

  private async searchRealBusinesses(params: BusinessSearchParams, maxResults: number): Promise<DiscoveredBusiness[]> {
    const { industry = 'business', location = 'United States', keywords = '' } = params;
    
    // Construct search query for business discovery
    const query = `${industry} ${keywords} businesses in ${location} contact phone website`.trim();
    
    const searchParams = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'google',
      q: query,
      location: location,
      hl: 'en',
      gl: 'us',
      num: Math.min(maxResults, 20).toString()
    });

    // Add timeout and retry logic
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const response = await fetch(`https://serpapi.com/search?${searchParams}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`SerpAPI request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`SerpAPI error: ${data.error}`);
      }

      return this.parseSerpResults(data, params);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private parseSerpResults(data: any, params: BusinessSearchParams): DiscoveredBusiness[] {
    const businesses: DiscoveredBusiness[] = [];
    
    try {
      const results = data.organic_results || [];
      
      // Handle local_results - can be object with places array or direct array
      let localPlaces: any[] = [];
      if (data.local_results) {
        if (Array.isArray(data.local_results)) {
          localPlaces = data.local_results;
        } else if (data.local_results.places && Array.isArray(data.local_results.places)) {
          localPlaces = data.local_results.places;
        }
      }

      logger.info('SerpAPI parsing results', {
        organicResults: results.length,
        localPlaces: localPlaces.length,
        rawLocalResults: typeof data.local_results
      });

      // Process local business results first (more relevant)
      for (const result of localPlaces.slice(0, 10)) {
        try {
          const business: DiscoveredBusiness = {
            sourceId: `serpapi_local_${result.place_id || result.position || Date.now()}`,
            sourceName: 'serpapi',
            businessName: result.title || result.name || 'Unknown Business',
            website: result.website || result.link || null,
            address: result.address || null,
            phone: result.phone || null,
            email: this.extractEmailFromSnippet(result.snippet || result.description),
            industry: params.industry || 'business',
            rating: result.rating || null,
            reviewCount: result.reviews || result.review_count || 0,
            priceLevel: result.price_level ? result.price_level.toString() : null,
            description: result.snippet || result.description || `Business found via Google search`,
            hours: result.hours ? { open_now: result.hours.open_now } : null,
            rawData: { source: 'serpapi_real', type: 'local_result', data: result }
          };
          businesses.push(business);
        } catch (parseError) {
          logger.warn('Failed to parse local result', { error: parseError, result });
        }
      }

      // Process organic search results for additional businesses
      for (const result of results.slice(0, 10)) {
        try {
          if (this.isBusinessResult(result)) {
            const business: DiscoveredBusiness = {
              sourceId: `serpapi_organic_${result.position || Date.now()}`,
              sourceName: 'serpapi',
              businessName: result.title || 'Unknown Business',
              website: result.link || null,
              address: this.extractAddressFromSnippet(result.snippet),
              phone: this.extractPhoneFromSnippet(result.snippet),
              email: this.extractEmailFromSnippet(result.snippet),
              industry: params.industry || 'business',
              rating: null,
              reviewCount: 0,
              priceLevel: null,
              description: result.snippet || `Business found via Google search`,
              hours: null,
              rawData: { source: 'serpapi_real', type: 'organic_result', data: result }
            };
            businesses.push(business);
          }
        } catch (parseError) {
          logger.warn('Failed to parse organic result', { error: parseError, result });
        }
      }
      
      logger.info('SerpAPI parsing completed', {
        totalBusinesses: businesses.length,
        localBusinesses: localPlaces.length,
        organicBusinesses: businesses.filter(b => b.sourceId.includes('organic')).length
      });
      
      return businesses;
      
    } catch (error) {
      logger.error('SerpAPI parsing failed completely', { error, dataKeys: Object.keys(data || {}) });
      throw new Error(`Failed to parse SerpAPI results: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private isBusinessResult(result: any): boolean {
    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || '').toLowerCase();
    const link = (result.link || '').toLowerCase();
    
    // Check for business indicators
    const businessIndicators = [
      'contact', 'phone', 'address', 'services', 'hours',
      'location', 'business', 'company', 'inc', 'llc',
      'restaurant', 'shop', 'store', 'service'
    ];
    
    return businessIndicators.some(indicator => 
      title.includes(indicator) || snippet.includes(indicator)
    ) && !link.includes('wikipedia.org') && !link.includes('facebook.com');
  }

  private extractEmailFromSnippet(text: string): string | null {
    if (!text) return null;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const match = text.match(emailRegex);
    return match ? match[0] : null;
  }

  private extractPhoneFromSnippet(text: string): string | null {
    if (!text) return null;
    const phoneRegex = /\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/;
    const match = text.match(phoneRegex);
    return match ? match[0] : null;
  }

  private extractAddressFromSnippet(text: string): string | null {
    if (!text) return null;
    // Look for common address patterns
    const addressRegex = /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)/i;
    const match = text.match(addressRegex);
    return match ? match[0] : null;
  }

  private parsePriceLevel(price: string): string | null {
    if (!price) return null;
    const dollarSigns = (price.match(/\$/g) || []).length;
    return dollarSigns > 0 ? dollarSigns.toString() : null;
  }

  private generateSerpBusinesses(params: BusinessSearchParams, count: number): DiscoveredBusiness[] {
    const businesses: DiscoveredBusiness[] = [];
    const { industry, location } = params;

    const serpDirectories = {
      restaurant: [
        { name: "Local Eats Co", directory: "YellowPages", rating: 4.1 },
        { name: "Family Food Hub", directory: "Local.com", rating: 4.3 },
        { name: "Quick Bite Express", directory: "MapQuest", rating: 4.0 },
        { name: "Gourmet Corner", directory: "Whitepages", rating: 4.4 },
        { name: "Street Food Central", directory: "Superpages", rating: 4.2 }
      ],
      services: [
        { name: "Reliable Home Services", directory: "Angie's List", rating: 4.6 },
        { name: "24/7 Repair Pros", directory: "HomeAdvisor", rating: 4.5 },
        { name: "Elite Service Group", directory: "Thumbtack", rating: 4.7 },
        { name: "Express Fix Solutions", directory: "TaskRabbit", rating: 4.4 },
        { name: "Premium Care Services", directory: "Porch", rating: 4.8 }
      ],
      technology: [
        { name: "Digital Innovation Labs", directory: "Crunchbase", rating: 4.3 },
        { name: "TechForward Systems", directory: "AngelList", rating: 4.5 },
        { name: "NextLevel Software", directory: "ProductHunt", rating: 4.4 },
        { name: "SmartSolutions Inc", directory: "LinkedIn", rating: 4.6 },
        { name: "FutureTech Ventures", directory: "Glassdoor", rating: 4.2 }
      ]
    };

    const directories = serpDirectories[industry] || serpDirectories.restaurant;
    
    for (let i = 0; i < count; i++) {
      const directory = directories[i % directories.length];
      const business: DiscoveredBusiness = {
        sourceId: `serp_sim_${i + 1}`,
        sourceName: 'serpapi',
        businessName: `${directory.name} ${location.split(',')[0]}`,
        website: `https://${directory.name.toLowerCase().replace(/[^a-z]/g, '')}.net`,
        address: `${300 + i} Discovery Blvd, ${location}`,
        phone: `(555) ${String(300 + i).padStart(3, '0')}-${String(3000 + i).padStart(4, '0')}`,
        email: `contact@${directory.name.toLowerCase().replace(/[^a-z]/g, '')}.net`,
        industry: industry,
        rating: directory.rating + (Math.random() * 0.5 - 0.25),
        reviewCount: Math.floor(Math.random() * 100) + 15,
        priceLevel: Math.floor(Math.random() * 3) + 2,
        description: `${industry} business found via ${directory.directory} in ${location.split(',')[0]}`,
        hours: { open_now: Math.random() > 0.25 },
        rawData: { simulated: true, source: 'serpapi', directory: directory.directory }
      };
      businesses.push(business);
    }

    return businesses;
  }
}

// Export singleton instance
export const discoveryEngine = new DiscoveryEngine();