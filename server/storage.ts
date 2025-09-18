import { users, scanResults, type User, type InsertUser, type ScanResult, type InsertScanResult } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getScanResult(id: string): Promise<ScanResult | undefined>;
  getAllScanResults(): Promise<ScanResult[]>;
  createScanResult(scanResult: InsertScanResult): Promise<ScanResult>;
  updateScanResult(id: string, updates: Partial<ScanResult>): Promise<ScanResult | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getScanResult(id: string): Promise<ScanResult | undefined> {
    const [result] = await db.select().from(scanResults).where(eq(scanResults.id, id));
    return result || undefined;
  }

  async getAllScanResults(): Promise<ScanResult[]> {
    const results = await db
      .select()
      .from(scanResults)
      .orderBy(desc(scanResults.createdAt));
    return results;
  }

  async createScanResult(insertScanResult: InsertScanResult): Promise<ScanResult> {
    const [result] = await db
      .insert(scanResults)
      .values({
        businessName: insertScanResult.businessName,
        website: insertScanResult.website || null,
        email: insertScanResult.email || null,
        scanData: insertScanResult.scanData || null,
        status: insertScanResult.status || "pending",
      })
      .returning();
    return result;
  }

  async updateScanResult(id: string, updates: Partial<ScanResult>): Promise<ScanResult | undefined> {
    const [result] = await db
      .update(scanResults)
      .set(updates)
      .where(eq(scanResults.id, id))
      .returning();
    return result || undefined;
  }
}

export const storage = new DatabaseStorage();
