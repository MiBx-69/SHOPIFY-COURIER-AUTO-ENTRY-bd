import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { message, digest } = await request.json();
    const alertMessage = `🚨 Unhandled UI Error\n\nError: ${message}\nDigest: ${digest || "N/A"}`;
    
    // Server-side logging
    console.error("[UI Error Report]", alertMessage);
    
    // If you need global telegram notification, implement here.
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process error report" }, { status: 500 });
  }
}
