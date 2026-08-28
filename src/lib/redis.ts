import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const redis: Redis | null = redisUrl && redisToken
  ? new Redis({ 
      url: redisUrl, 
      token: redisToken,
      retry: { retries: 1, backoff: (retryCount) => Math.exp(retryCount) * 50 }
    })
  : null;

if (!redis) {
  console.warn("⚠️ Redis client initialized in fallback mode: UPSTASH_REDIS_REST_URL or TOKEN is missing.");
}

export function generateCacheKey(shopId: string, prefix: string, params: Record<string, unknown> = {}) {
  const hash = crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);
  return `mibx:shop:${shopId}:${prefix}:${hash}`;
}

export async function invalidateCountsCache(shopIds: string[]) {
  return invalidateOrderCaches(shopIds);
}

export async function invalidateOrderCaches(shopIds: string[]) {
  if (!redis || shopIds.length === 0) return;

  try {
    const keysToDelete = new Set<string>();

    for (const id of shopIds) {
      keysToDelete.add(`counts:${id}`);

      // Pickup-location cache family.
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: `mibx:shop:${id}:*`, count: 100 });
        cursor = String(nextCursor);
        for (const key of keys) keysToDelete.add(key);
      } while (cursor !== "0");

      // Centralized V1 order/count cache family. Organization is wildcarded
      // because callers have already verified shop ownership.
      cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: `mibx:v1:org:*:shop:${id}:*`, count: 100 });
        cursor = String(nextCursor);
        for (const key of keys) keysToDelete.add(key);
      } while (cursor !== "0");
    }

    const keys = Array.from(keysToDelete);
    for (let i = 0; i < keys.length; i += 100) {
      await redis.del(...keys.slice(i, i + 100));
    }
  } catch (err) {
    // Cache failure must never fail the primary database mutation.
    console.warn("Failed to invalidate Redis cache:", err);
  }
}
