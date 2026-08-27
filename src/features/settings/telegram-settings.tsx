"use client";

import { useState, useCallback } from "react";
import { Send, CheckCircle2, AlertCircle, Loader2, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  shopId: string;
  isConfigured: boolean;
}

export function TelegramSettings({ shopId: _shopId, isConfigured: initialConfigured }: Props) {
  const [isConfigured] = useState(initialConfigured);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");

  const handleTest = useCallback(async () => {
    setTestStatus("loading");
    setTestError("");
    try {
      const res = await fetch("/api/notifications/telegram/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Test failed");
      }
      setTestStatus("success");
      setTimeout(() => setTestStatus("idle"), 4000);
    } catch (err) {
      setTestStatus("error");
      setTestError(err instanceof Error ? err.message : "Failed to send test notification.");
    }
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
      <div className="flex items-center gap-2">
        <Bell size={15} className="text-slate-400" />
        <h3 className="font-semibold text-sm text-slate-900">Telegram Notifications</h3>
      </div>

      {/* Status indicator */}
      <div className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-medium ${
        isConfigured
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-amber-50 text-amber-800 border border-amber-200"
      }`}>
        {isConfigured ? (
          <><CheckCircle2 size={13} /> Telegram is configured and active</>
        ) : (
          <><BellOff size={13} /> Telegram is not configured</>
        )}
      </div>

      {isConfigured ? (
        <div className="space-y-3">
          <div className="text-xs text-slate-600 space-y-1">
            <p>Critical and error-level events will trigger Telegram alerts.</p>
            <p className="text-slate-500">Alerts are deduplicated — identical errors within 5 minutes are grouped into a single message.</p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-700 mb-2">Alert levels</p>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /> Critical — immediate alert</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" /> Error — alert sent</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" /> Warning / Info — no alert</div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <Button
              variant="secondary"
              className="text-xs py-1.5 px-3 min-h-8"
              onClick={handleTest}
              disabled={testStatus === "loading"}
            >
              {testStatus === "loading" ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : (
                <Send size={12} className="mr-1.5" />
              )}
              {testStatus === "success" ? "Test Sent!" : "Send Test Notification"}
            </Button>

            {testStatus === "success" && (
              <p className="mt-2 text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={11} /> Test message sent. Check your Telegram chat.
              </p>
            )}
            {testStatus === "error" && (
              <p className="mt-2 text-[11px] text-red-600 flex items-center gap-1">
                <AlertCircle size={11} /> {testError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs text-slate-600">
          <p>To enable Telegram alerts, set the following environment variables on your server:</p>
          <div className="rounded-md bg-slate-900 text-slate-100 p-3 font-mono text-[11px] space-y-1">
            <p>TELEGRAM_BOT_TOKEN=<span className="text-slate-400">your-bot-token</span></p>
            <p>TELEGRAM_CHAT_ID=<span className="text-slate-400">your-chat-id</span></p>
          </div>
          <p className="text-slate-500">
            Create a bot via <strong>@BotFather</strong> on Telegram to get a bot token.
            Then add it to your Vercel Environment Variables and redeploy.
          </p>
        </div>
      )}
    </div>
  );
}
