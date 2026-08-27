import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

type ServiceStatus = "healthy" | "degraded" | "offline";

interface HealthResult {
  status: ServiceStatus;
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<HealthResult> {
  const start = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("shops").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "offline", latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<HealthResult> {
  const start = Date.now();
  if (!redis) return { status: "offline", latencyMs: 0, error: "Redis not configured" };
  try {
    const res = await redis.ping();
    if (res !== "PONG") throw new Error("Invalid Redis response");
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "offline", latencyMs: Date.now() - start };
  }
}

async function checkCourierEndpoint(name: string, urlEnvKey: string, testPath: string): Promise<HealthResult> {
  const baseUrl = process.env[urlEnvKey];
  if (!baseUrl) return { status: "degraded", error: "URL not configured" };

  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${testPath}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    // Any response (even 401/403) means the endpoint is reachable
    const latencyMs = Date.now() - start;
    if (response.status < 500) return { status: "healthy", latencyMs };
    return { status: "degraded", latencyMs };
  } catch {
    return { status: "offline", latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const start = Date.now();

  const [db, redisCheck, redx, pathao, steadfast] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkCourierEndpoint("redx", "REDX_API_URL", "/v2/orders"),
    checkCourierEndpoint("pathao", "PATHAO_API_URL", "/aladdin/api/v1/info"),
    checkCourierEndpoint("steadfast", "STEADFAST_API_URL", "/api/v1/status"),
  ]);

  const resolve = (result: PromiseSettledResult<HealthResult>): HealthResult =>
    result.status === "fulfilled" ? result.value : { status: "offline" };

  const services = {
    database: resolve(db),
    redis: resolve(redisCheck),
    redx: resolve(redx),
    pathao: resolve(pathao),
    steadfast: resolve(steadfast),
  };

  // Overall status: offline if DB or Redis is down; degraded if any courier is down
  const overallStatus: ServiceStatus =
    services.database.status === "offline" || services.redis.status === "offline"
      ? "offline"
      : Object.values(services).some((s) => s.status === "offline" || s.status === "degraded")
      ? "degraded"
      : "healthy";

  const httpStatus = overallStatus === "offline" ? 503 : overallStatus === "degraded" ? 200 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeMs: process.uptime ? Math.round(process.uptime() * 1000) : undefined,
      responseMs: Date.now() - start,
      services: {
        database: { status: services.database.status, latencyMs: services.database.latencyMs },
        redis: { status: services.redis.status, latencyMs: services.redis.latencyMs },
        couriers: {
          redx: { status: services.redx.status, latencyMs: services.redx.latencyMs },
          pathao: { status: services.pathao.status, latencyMs: services.pathao.latencyMs },
          steadfast: { status: services.steadfast.status, latencyMs: services.steadfast.latencyMs },
        },
      },
      // Never expose secrets, connection strings, tokens, or internal config
    },
    { status: httpStatus }
  );
}
