import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { telegramNotifier } from "@/lib/notifications/telegram";

// POST /api/notifications/telegram/test — send a test Telegram notification
export async function POST(request: NextRequest) {
  try {
    await currentUser(); // Must be authenticated
    const body = await request.json().catch(() => ({}));
    const chatId = typeof body.chatId === "string" ? body.chatId : undefined;

    const result = await telegramNotifier.sendTest(chatId);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Test notification sent successfully." });
  } catch (error) {
    return apiError(error);
  }
}

// GET /api/notifications/telegram/test — check Telegram configuration status
export async function GET() {
  try {
    await currentUser();

    const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

    return NextResponse.json({
      configured,
      // Never expose the actual token or chat ID — only indicate whether configured
      message: configured
        ? "Telegram is configured."
        : "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set.",
    });
  } catch (error) {
    return apiError(error);
  }
}
