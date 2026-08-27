import { Redis } from "@upstash/redis";
import crypto from "crypto";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export function generateCacheKey(shopId: string, prefix: string, params: Record<string, unknown> = {}) {
  const hash = crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);
  // Pattern: mibx:org:*:shop:{shopId}:{prefix}:{hash}
  return `mibx:shop:${shopId}:${prefix}:${hash}`;
}

export async function invalidateCountsCache(shopIds: string[]) {
  return invalidateOrderCaches(shopIds); // Route legacy to the new method
}

export async function invalidateOrderCaches(shopIds: string[]) {
  if (!redis || shopIds.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    let keysToDelete: string[] = [];
    
    // Also add legacy counts format for safety
    shopIds.forEach(id => keysToDelete.push(`counts:${id}`));

    for (const id of shopIds) {
      // Find all keys matching mibx:shop:{id}:* 
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: `mibx:shop:${id}:*`, count: 100 });
        cursor = nextCursor;
        if (keys.length > 0) {
          keysToDelete.push(...keys);
        }
      } while (cursor !== "0");
    }

    if (keysToDelete.length > 0) {
      // De-duplicate keys
      keysToDelete = Array.from(new Set(keysToDelete));
      
      // Upstash Redis limits DEL commands to a certain size, so batch them
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        pipeline.del(...keysToDelete.slice(i, i + batchSize));
      }
      
      await pipeline.exec();
    }
  } catch (err) {
    console.warn("Failed to invalidate Redis cache:", err);
  }
}
