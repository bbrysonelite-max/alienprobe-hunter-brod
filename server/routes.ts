import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScanResultSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes for Alien Probe business scanning
  
  // Create a new scan (both /api/scan and /api/free-scan for compatibility)
  const handleScanRequest = async (req: Request, res: Response) => {
    try {
      const validatedData = insertScanResultSchema.parse(req.body);
      
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

      // Simulate async processing completion
      setTimeout(async () => {
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
      }, 2000);

      res.json({ 
        success: true, 
        scanId: scanResult.id,
        message: "Scan initiated successfully" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          success: false, 
          error: "Validation failed", 
          details: error.errors 
        });
      } else {
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
      res.json(results);
    } catch (error) {
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
        res.status(404).json({ 
          success: false, 
          error: "Scan result not found" 
        });
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch result" 
      });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      service: "Alien Probe Business Scanner" 
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
