import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const health: Record<string, string> = {
    status: "healthy",
    redis: "disconnected",
    database: "disconnected",
  };

  // 1. Check Redis
  if (redis) {
    try {
      await redis.ping();
      health.redis = "connected";
    } catch (error) {
      health.redis = "error";
      health.status = "degraded";
    }
  } else {
    health.redis = "unconfigured";
    health.status = "degraded";
  }

  // 2. Check Database
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("organizations").select("id").limit(1);
    if (error) throw error;
    health.database = "connected";
  } catch (error) {
    health.database = "error";
    health.status = "unhealthy"; // DB is critical
  }

  const statusCode = health.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(health, { status: statusCode });
}
