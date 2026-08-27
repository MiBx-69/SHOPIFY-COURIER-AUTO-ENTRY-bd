import { redis } from "@/lib/redis";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export async function enforceRateLimit(key: string, limit = 30, windowMs = 60_000) {
  if (redis) {
    const windowSecs = Math.ceil(windowMs / 1000);
    const rKey = `ratelimit:${key}`;
    const count = await redis.incr(rKey);
    if (count === 1) {
      await redis.expire(rKey, windowSecs);
    }
    if (count > limit) {
      throw new Error("RATE_LIMITED");
    }
    return;
  }

  // Fallback to in-memory Map
  const now = Date.now(); 
  const current = buckets.get(key);
  if (!current || current.resetAt < now) { 
    // basic garbage collection for memory leak
    if (buckets.size > 10000) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs }); 
    return; 
  }
  if (++current.count > limit) throw new Error("RATE_LIMITED");
}
