import type { StructuredError } from "@/lib/errors";

// ─── Deduplication & Rate Limiting ───────────────────────────────────────────
// In-memory dedup: prevents alert storms on repeated identical errors.
// Keyed by category+service — resets after COOLDOWN_MS.
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per category per service
const MAX_ALERTS_PER_WINDOW = 3;    // Max 3 alerts per category before throttle message

interface AlertBucket {
  count: number;
  resetAt: number;
  lastErrorId: string;
  lastTimestamp: string;
}

const alertBuckets = new Map<string, AlertBucket>();

function getBucketKey(alert: StructuredError): string {
  return `${alert.category}:${alert.service}:${alert.courier ?? ""}`;
}

function shouldSendAlert(severity: StructuredError["severity"]): boolean {
  return severity === "CRITICAL" || severity === "ERROR";
}

// ─── Message Formatter ────────────────────────────────────────────────────────
function formatAlert(alert: StructuredError, grouped?: { count: number; firstId: string }): string {
  const emoji = alert.severity === "CRITICAL" ? "🚨" : "⚠️";
  const env = process.env.NODE_ENV === "production" ? "Production" : "Development";

  const lines: string[] = [
    `${emoji} <b>MiBx-Dispatch ${alert.severity === "CRITICAL" ? "CRITICAL ERROR" : "Error"}</b>`,
    "",
    `<b>Severity:</b> ${alert.severity}`,
    `<b>Service:</b> ${alert.service}`,
    `<b>Environment:</b> ${env}`,
  ];

  if (alert.operation) lines.push(`<b>Operation:</b> ${alert.operation}`);
  if (alert.courier)   lines.push(`<b>Courier:</b> ${alert.courier.toUpperCase()}`);
  if (alert.shopId)    lines.push(`<b>Store ID:</b> ${alert.shopId.slice(0, 8)}…`);
  if (alert.orderId)   lines.push(`<b>Order ID:</b> ${alert.orderId.slice(0, 8)}…`);

  lines.push(
    `<b>Error ID:</b> <code>${alert.errorId}</code>`,
    `<b>HTTP:</b> ${alert.httpStatus ?? "—"}`,
    `<b>Message:</b> ${alert.safeMessage}`,
    `<b>Time:</b> ${alert.timestamp}`,
  );

  // Grouped alert summary
  if (grouped && grouped.count > 1) {
    lines.push("");
    lines.push(`📊 <b>${grouped.count} similar errors since last alert</b>`);
    lines.push(`First: <code>${grouped.firstId}</code>`);
  }

  // NOTE: Never include: API keys, tokens, passwords, customer phone,
  // full addresses, authorization headers, or any secret values.

  return lines.join("\n");
}

// ─── Telegram Sender ──────────────────────────────────────────────────────────
async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    // Telegram not configured — skip silently
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn(JSON.stringify({
      level: "WARN",
      service: "telegram",
      message: "Failed to send Telegram alert",
      httpStatus: response.status,
      // Only log status — do not log the token, chat ID, or message body
    }));
    if (body) console.warn(body.slice(0, 200));
  }
}

// ─── Public Notifier ──────────────────────────────────────────────────────────
class TelegramNotifier {
  async sendAlert(alert: StructuredError): Promise<void> {
    try {
      // Only alert on ERROR or CRITICAL
      if (!shouldSendAlert(alert.severity)) return;

      const bucketKey = getBucketKey(alert);
      const now = Date.now();
      const bucket = alertBuckets.get(bucketKey);

      if (bucket && bucket.resetAt > now) {
        // Within cooldown window
        bucket.count++;
        bucket.lastErrorId = alert.errorId;
        bucket.lastTimestamp = alert.timestamp;

        if (bucket.count > MAX_ALERTS_PER_WINDOW) {
          // Throttled — only send a grouped summary once when we hit the limit
          if (bucket.count === MAX_ALERTS_PER_WINDOW + 1) {
            const summaryText = formatAlert(alert, {
              count: bucket.count,
              firstId: bucket.lastErrorId,
            });
            await sendTelegramMessage(summaryText);
          }
          // After summary, suppress until window resets
          return;
        }
      } else {
        // New window
        alertBuckets.set(bucketKey, {
          count: 1,
          resetAt: now + COOLDOWN_MS,
          lastErrorId: alert.errorId,
          lastTimestamp: alert.timestamp,
        });
      }

      const text = formatAlert(alert);
      await sendTelegramMessage(text);
    } catch {
      // Telegram failures must never crash application flows
    }
  }

  async sendTest(chatId?: string): Promise<{ success: boolean; error?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const target = chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !target) {
      return { success: false, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured" };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target,
          text: [
            "✅ <b>MiBx-Dispatch Test Notification</b>",
            "",
            "This is a test message from your MiBx-Dispatch instance.",
            "Telegram alerting is correctly configured.",
            "",
            `<b>Environment:</b> ${process.env.NODE_ENV === "production" ? "Production" : "Development"}`,
            `<b>Time:</b> ${new Date().toISOString()}`,
          ].join("\n"),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { success: false, error: `Telegram API error: ${response.status}` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}

export const telegramNotifier = new TelegramNotifier();
