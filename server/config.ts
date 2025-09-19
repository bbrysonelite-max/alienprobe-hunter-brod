import { z } from "zod";

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Database Configuration
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PGHOST: z.string().optional(),
  PGPORT: z.coerce.number().int().positive().max(65535).optional(),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().optional(),
  
  // Security
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  
  // Application Settings
  APP_NAME: z.string().default("Alien Probe Business Scanner"),
  APP_VERSION: z.string().default("1.0.0"),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  
  // CORS Configuration
  ALLOWED_ORIGINS: z.string().optional(),
  
  // Performance Settings
  ENABLE_COMPRESSION: z.coerce.boolean().default(true),
  CACHE_TTL: z.coerce.number().int().positive().max(31536000).default(3600), // Max 1 year
  
  // Feature Flags
  ENABLE_API_DOCS: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(false),
});

// Validate and parse environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      console.error("❌ Environment validation failed:");
      console.error(errorMessages);
      process.exit(1);
    }
    throw error;
  }
}

export const config = validateEnv();

// Helper functions for common configuration checks
export const isProduction = () => config.NODE_ENV === "production";
export const isDevelopment = () => config.NODE_ENV === "development";
export const isTest = () => config.NODE_ENV === "test";

// CORS origins helper
export const getAllowedOrigins = (): string[] => {
  if (!config.ALLOWED_ORIGINS) {
    return isProduction() ? [] : ["*"];
  }
  return config.ALLOWED_ORIGINS.split(",").map(origin => origin.trim());
};

// CORS helper for handling credentials properly
export const isCorsCredentialsAllowed = (origin: string): boolean => {
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin) && !allowedOrigins.includes("*");
};

// Database connection validation
export const validateDatabaseConnection = () => {
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  
  try {
    new URL(config.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }
};

// Configuration logging (safe for production)
export const logConfiguration = () => {
  const safeConfig = {
    ...config,
    DATABASE_URL: config.DATABASE_URL.replace(/:[^:]+@/, ":***@"), // Mask password
    SESSION_SECRET: "***",
    PGPASSWORD: "***",
  };
  
  console.log("🔧 Application Configuration:");
  console.log(JSON.stringify(safeConfig, null, 2));
};