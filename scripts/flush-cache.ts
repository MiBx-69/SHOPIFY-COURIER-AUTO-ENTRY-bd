import { Redis } from "@upstash/redis";

async function flushAllCache() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log("⚠️ No Redis configuration found in environment.");
    return;
  }

  const redis = new Redis({ url, token });

  console.log("🧹 Flushing Redis cache...");
  try {
    let cursor = "0";
    let count = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: "mibx:*", count: 100 });
      cursor = String(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
        count += keys.length;
      }
    } while (cursor !== "0");

    console.log(`✅ Successfully flushed ${count} Redis cache entries!`);
  } catch (error) {
    console.error("❌ Error flushing Redis cache:", error);
  }
}

flushAllCache();
