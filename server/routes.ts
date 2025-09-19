import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScanResultSchema } from "@shared/schema";
import { z } from "zod";
import { healthCheck, livenessProbe, readinessProbe, metricsEndpoint, simulateError } from "./monitoring";
import { logger } from "./logger";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes for Alien Probe business scanning
  
  // Create a new scan (both /api/scan and /api/free-scan for compatibility)
  const handleScanRequest = async (req: Request, res: Response) => {
    try {
      const validatedData = insertScanResultSchema.parse(req.body);
      
      logger.info('Scan request initiated', { 
        businessName: validatedData.businessName,
        hasWebsite: !!validatedData.website,
        hasEmail: !!validatedData.email,
      });
      
      // Simulate business scanning process
      const scanResult = await storage.createScanResult({
        ...validatedData,
        status: "scanning",
        scanData: JSON.stringify({
          timestamp: new Date().toISOString(),
          websiteAnalysis: validatedData.website ? "Website found and analyzed" : "No website provided",
          businessScore: Math.floor(Math.random() * 100) + 1,
        }),
      });

      logger.info('Scan result created', { scanId: scanResult.id, status: 'scanning' });

      // Simulate async processing completion
      setTimeout(async () => {
        try {
          await storage.updateScanResult(scanResult.id, { 
            status: "completed",
            scanData: JSON.stringify({
              ...JSON.parse(scanResult.scanData || "{}"),
              completed: true,
              insights: [
                "Strong online presence detected",
                "Potential for digital expansion",
                "Competitive market position",
              ],
            }),
          });
          logger.info('Scan processing completed', { scanId: scanResult.id });
        } catch (error) {
          logger.error('Scan processing failed', error as Error, { scanId: scanResult.id });
          await storage.updateScanResult(scanResult.id, { status: "failed" });
        }
      }, 2000);

      res.json({ 
        success: true, 
        scanId: scanResult.id,
        message: "Scan initiated successfully" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Scan request validation failed', { errors: error.errors });
        res.status(400).json({ 
          success: false, 
          error: "Validation failed", 
          details: error.errors 
        });
      } else {
        logger.error('Scan request failed', error as Error);
        res.status(500).json({ 
          success: false, 
          error: "Internal server error" 
        });
      }
    }
  };

  // Register the route for both endpoints
  app.post("/api/scan", handleScanRequest);
  app.post("/api/free-scan", handleScanRequest);

  // Get all scan results
  app.get("/api/results", async (req, res) => {
    try {
      const results = await storage.getAllScanResults();
      logger.info('Scan results retrieved', { count: results.length });
      res.json(results);
    } catch (error) {
      logger.error('Failed to fetch scan results', error as Error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch results" 
      });
    }
  });

  // Get specific scan result
  app.get("/api/results/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getScanResult(id);
      
      if (!result) {
        logger.warn('Scan result not found', { scanId: id });
        res.status(404).json({ 
          success: false, 
          error: "Scan result not found" 
        });
        return;
      }

      logger.info('Scan result retrieved', { scanId: id, status: result.status });
      res.json(result);
    } catch (error) {
      logger.error('Failed to fetch scan result', error as Error, { scanId: req.params.id });
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch result" 
      });
    }
  });

  // Health and monitoring endpoints
  app.get("/api/health", healthCheck);
  app.get("/api/health/live", livenessProbe);
  app.get("/api/health/ready", readinessProbe);
  app.get("/api/metrics", metricsEndpoint);
  
  // Development-only error simulation endpoint
  app.get("/api/simulate-error", simulateError);

  const httpServer = createServer(app);
  return httpServer;
}
