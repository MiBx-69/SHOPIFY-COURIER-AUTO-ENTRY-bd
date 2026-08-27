import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export async function invalidateCountsCache(shopIds: string[]) {
  if (!redis || shopIds.length === 0) return;
  try {
    const keys = shopIds.map((id) => `counts:${id}`);
    await redis.del(...keys);
  } catch (err) {
    console.warn("Failed to invalidate Redis cache:", err);
  }
}
