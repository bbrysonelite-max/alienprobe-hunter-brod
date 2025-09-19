import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config, isProduction, getAllowedOrigins, isCorsCredentialsAllowed, validateDatabaseConnection, logConfiguration } from "./config";
import { logger, requestLoggingMiddleware, errorLoggingMiddleware, logApplicationStart, logApplicationReady } from "./logger";
import { dbInitializer } from "./database/init";
import compression from "compression";
import path from "path";
import fs from "fs";

const app = express();

// Enable compression in production
if (config.ENABLE_COMPRESSION) {
  app.use(compression());
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware (before routes)
app.use(requestLoggingMiddleware);

// CORS configuration with environment-based origins
app.use((req, res, next) => {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.get('Origin') || '';
  
  // Set origin header appropriately
  if (allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Vary', 'Origin');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Expose-Headers', 'X-Request-Id');
  
  // Only set credentials when origin is explicitly allowed (not wildcard)
  if (isCorsCredentialsAllowed(origin)) {
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Note: Request/response logging is now handled by requestLoggingMiddleware

// Serve static files from the GitHub repository's dist folder
const distPath = path.resolve(import.meta.dirname, "dist");

(async () => {
  // Log application startup
  logApplicationStart();
  
  // Validate configuration and database connection
  validateDatabaseConnection();
  logConfiguration();
  
  // Initialize database (migrations + seeding if needed)
  const dbReady = await dbInitializer.initializeForStartup();
  if (!dbReady) {
    logger.error('Failed to initialize database, shutting down');
    process.exit(1);
  }
  
  const server = await registerRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorLoggingMiddleware);

  // Serve the React build files if available, otherwise fallback to Vite
  if (fs.existsSync(distPath)) {
    log(`Serving ${config.APP_NAME} React build from dist folder`);
    
    // Add caching headers for static assets in production
    if (isProduction()) {
      app.use(express.static(distPath, {
        maxAge: config.CACHE_TTL * 1000, // Convert to milliseconds
        etag: true,
        lastModified: true,
      }));
    } else {
      app.use(express.static(distPath));
    }
    
    // Handle React routing - serve index.html for non-API routes
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  } else {
    log("Dist folder not found, using Vite development server");
    
    if (!isProduction()) {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  server.listen({
    port: config.PORT,
    host: config.HOST,
    reusePort: true,
  }, () => {
    log(`🚀 ${config.APP_NAME} v${config.APP_VERSION} running on ${config.HOST}:${config.PORT}`);
    log(`📦 Environment: ${config.NODE_ENV}`);
    log(`💾 Database: Connected`);
    logApplicationReady();
  });
})();
