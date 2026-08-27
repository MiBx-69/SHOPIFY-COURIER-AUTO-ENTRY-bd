import { redis } from "@/lib/redis";
import crypto from "crypto";

/**
 * Centralized Cache Service
 * Provides robust fallbacks if Redis is unavailable, ensuring the application doesn't crash.
 */

// Generate a tenant-safe cache key
export function generateCacheKey(organizationId: string, shopId: string, prefix: string, params: Record<string, unknown> = {}) {
  const hash = crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);
  // Pattern: mibx:v1:org:{organizationId}:shop:{shopId}:{prefix}:{hash}
  return `mibx:v1:org:${organizationId}:shop:${shopId}:${prefix}:${hash}`;
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (error) {
    console.warn(`[Cache GET Error] ${key}:`, error);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = 30): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    console.warn(`[Cache SET Error] ${key}:`, error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    console.warn(`[Cache DEL Error] ${key}:`, error);
  }
}

export async function invalidateOrderCaches(organizationId: string, shopId: string): Promise<void> {
  if (!redis) return;
  try {
    const pattern = `mibx:v1:org:${organizationId}:shop:${shopId}:*`;
    let cursor = "0";
    let keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        keysToDelete.push(...keys);
      }
    } while (cursor !== "0");

    if (keysToDelete.length > 0) {
      keysToDelete = Array.from(new Set(keysToDelete));
      const pipeline = redis.pipeline();
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        pipeline.del(...keysToDelete.slice(i, i + batchSize));
      }
      await pipeline.exec();
    }
  } catch (error) {
    console.warn(`[Cache Invalidate Error] shop:${shopId}:`, error);
  }
}
