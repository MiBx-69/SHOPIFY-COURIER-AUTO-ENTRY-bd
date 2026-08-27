import { GET as healthCheck } from "../route";

export const dynamic = "force-dynamic";

export async function GET() {
  // Readiness probe delegates to the main health check, which verifies DB and Courier connectivity.
  return healthCheck();
}
