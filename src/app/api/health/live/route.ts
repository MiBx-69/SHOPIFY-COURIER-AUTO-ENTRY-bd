import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  // Liveness probe just needs to return 200 OK to indicate the process is running.
  return NextResponse.json({ status: "alive", timestamp: new Date().toISOString() });
}
