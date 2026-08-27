"use client";

import { useState, useCallback } from "react";
import { Shield, Key, LogOut, RefreshCcw, Clock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface SecurityEvent {
  id: string;
  event_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  email: string;
  recentEvents: SecurityEvent[];
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    login: "Sign in",
    logout: "Sign out (current device)",
    logout_everywhere: "Sign out (all devices)",
    passkey_registered: "Passkey registered",
    passkey_removed: "Passkey removed",
    password_changed: "Password changed",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

export function SecuritySettings({ email, recentEvents }: Props) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [passwordError, setPasswordError] = useState("");

  const [logoutStatus, setLogoutStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [logoutEverywhereStatus, setLogoutEverywhereStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleChangePassword = useCallback(async () => {
    if (!currentPass || newPass.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setPasswordStatus("loading");
    setPasswordError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setPasswordStatus("success");
      setCurrentPass("");
      setNewPass("");
      setShowChangePassword(false);
    } catch (err) {
      setPasswordStatus("error");
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    }
  }, [currentPass, newPass]);

  const handleLogout = useCallback(async () => {
    setLogoutStatus("loading");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed");
      setLogoutStatus("success");
      // Clear local state and redirect
      setTimeout(() => { window.location.href = "/login"; }, 1000);
    } catch {
      setLogoutStatus("error");
    }
  }, []);

  const handleLogoutEverywhere = useCallback(async () => {
    if (!confirm("This will sign you out from all devices including this one. Continue?")) return;
    setLogoutEverywhereStatus("loading");
    try {
      const res = await fetch("/api/auth/logout-everywhere", { method: "POST" });
      if (!res.ok) throw new Error("Logout everywhere failed");
      setLogoutEverywhereStatus("success");
      setTimeout(() => { window.location.href = "/login"; }, 1200);
    } catch {
      setLogoutEverywhereStatus("error");
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* Account Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={15} className="text-slate-400" />
          <h3 className="font-semibold text-sm text-slate-900">Account</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-xs text-slate-500">Email</span>
            <span className="text-xs font-mono font-medium text-slate-800">{email}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Password</p>
              <p className="text-xs text-slate-500 mt-0.5">Change your account password</p>
            </div>
            <Button
              variant="secondary"
              className="text-xs py-1 px-3 min-h-8"
              onClick={() => setShowChangePassword((v) => !v)}
            >
              <Key size={12} className="mr-1.5" />
              {showChangePassword ? "Cancel" : "Change Password"}
            </Button>
          </div>

          {showChangePassword && (
            <div className="mt-2 space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  placeholder="Current password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full text-xs rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCurrent ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  placeholder="New password (min 8 characters)"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full text-xs rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {passwordError && (
                <p className="text-[11px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={11} /> {passwordError}
                </p>
              )}
              {passwordStatus === "success" && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Password changed successfully.
                </p>
              )}
              <Button
                className="w-full h-8 text-xs bg-slate-900 text-white min-h-8"
                onClick={handleChangePassword}
                disabled={passwordStatus === "loading"}
              >
                {passwordStatus === "loading" ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
                Save New Password
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Session Management */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-4">
          <LogOut size={15} className="text-slate-400" />
          <h3 className="font-semibold text-sm text-slate-900">Sessions</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Sign out this device</p>
              <p className="text-xs text-slate-500 mt-0.5">End your session on this device only</p>
            </div>
            <Button
              variant="secondary"
              className="text-xs border-slate-300 py-1 px-3 min-h-8"
              onClick={handleLogout}
              disabled={logoutStatus === "loading" || logoutStatus === "success"}
            >
              {logoutStatus === "loading" ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <LogOut size={12} className="mr-1.5" />}
              {logoutStatus === "success" ? "Signing out…" : "Sign Out"}
            </Button>
          </div>

          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Sign out everywhere</p>
              <p className="text-xs text-slate-500 mt-0.5">Revoke all active sessions on all devices</p>
            </div>
            <Button
              variant="secondary"
              className="text-xs border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 py-1 px-3 min-h-8"
              onClick={handleLogoutEverywhere}
              disabled={logoutEverywhereStatus === "loading" || logoutEverywhereStatus === "success"}
            >
              {logoutEverywhereStatus === "loading" ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : (
                <RefreshCcw size={12} className="mr-1.5" />
              )}
              {logoutEverywhereStatus === "success" ? "Revoking…" : "Sign Out Everywhere"}
            </Button>
          </div>
        </div>
      </div>

      {/* Login History */}
      {recentEvents.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={15} className="text-slate-400" />
            <h3 className="font-semibold text-sm text-slate-900">Recent Security Events</h3>
          </div>
          <div className="space-y-2">
            {recentEvents.slice(0, 8).map((ev) => (
              <div key={ev.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-700 font-medium capitalize">{eventLabel(ev.event_type)}</span>
                <span className="text-slate-400 font-mono text-[10px]">
                  {new Date(ev.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
