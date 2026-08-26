"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  Fingerprint, 
  KeyRound, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  ShieldCheck, 
  LogOut 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { passkeyService } from "@/lib/auth/passkeys";

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at?: string;
  last_used_at?: string;
};

export function PasskeyManager() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const loadPasskeys = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await passkeyService.list();
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setKeys((data || []) as Passkey[]);
      }
    } catch {
      setMessage({ text: "Could not load passkeys.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    passkeyService.list().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setKeys((data || []) as Passkey[]);
      }
    }).catch(() => {
      // Non-blocking initial load
    });
    return () => {
      active = false;
    };
  }, []);

  function getDeviceDefaultName(): string {
    if (typeof window === "undefined") return "My Device Passkey";
    const ua = window.navigator.userAgent;
    let platform = "Device";
    if (ua.includes("Mac")) platform = "MacBook / Apple";
    else if (ua.includes("Win")) platform = "Windows Hello";
    else if (ua.includes("Android")) platform = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS Device";

    let browser = "";
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Edg")) browser = "Edge";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Firefox")) browser = "Firefox";

    return browser ? `${platform} (${browser})` : platform;
  }

  async function handleRegister() {
    setRegistering(true);
    setMessage(null);
    try {
      if (typeof window === "undefined" || !window.PublicKeyCredential) {
        setMessage({
          text: "Passkeys / WebAuthn are not supported on this browser.",
          type: "error"
        });
        setRegistering(false);
        return;
      }

      const { error } = await passkeyService.register();
      if (error) {
        const msg = error.message || "";
        if (
          msg.includes("NotAllowedError") ||
          msg.includes("cancel") ||
          msg.includes("abort") ||
          msg.includes("rejected")
        ) {
          setMessage({ text: "Passkey registration was cancelled.", type: "info" });
        } else {
          setMessage({ text: msg, type: "error" });
        }
      } else {
        setMessage({ text: "Passkey registered successfully!", type: "success" });
        loadPasskeys();
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setMessage({
        text: errorObj.message || "Failed to register passkey.",
        type: "error"
      });
    } finally {
      setRegistering(false);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setActionLoadingId(id);
    try {
      const { error } = await passkeyService.rename(id, editName.trim());
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, friendly_name: editName.trim() } : k))
        );
        setEditingId(null);
        setMessage({ text: "Passkey renamed successfully.", type: "success" });
      }
    } catch {
      setMessage({ text: "Failed to rename passkey.", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm("Remove this passkey? You won't be able to use it to sign in.")) return;
    setActionLoadingId(id);
    try {
      const { error } = await passkeyService.remove(id);
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setMessage({ text: "Passkey removed.", type: "success" });
      }
    } catch {
      setMessage({ text: "Failed to remove passkey.", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSignOutOtherSessions() {
    if (!window.confirm("Sign out of all other devices and browser sessions?")) return;
    try {
      const { error } = await passkeyService.signOutOtherSessions();
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setMessage({ text: "Signed out of all other active sessions.", type: "success" });
      }
    } catch {
      setMessage({ text: "Could not complete sign-out.", type: "error" });
    }
  }

  function formatDate(dStr?: string) {
    if (!dStr) return "Recently added";
    try {
      const d = new Date(dStr);
      return `Added ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } catch {
      return "Added recently";
    }
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRegister}
            disabled={registering}
            className="h-8 px-3 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            {registering ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
            <span>Register New Passkey</span>
          </Button>

          <Button
            variant="secondary"
            onClick={loadPasskeys}
            disabled={loading}
            className="h-8 px-2.5 text-xs flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </Button>
        </div>

        <Button
          variant="secondary"
          onClick={handleSignOutOtherSessions}
          className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
        >
          <LogOut size={12} />
          <span>Sign Out Other Sessions</span>
        </Button>
      </div>

      {/* Messages */}
      {message && (
        <div
          role="status"
          className={`rounded-lg p-3 text-xs flex items-center justify-between border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : message.type === "error"
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-slate-50 text-slate-700 border-slate-200"
          }`}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-700 ml-2 cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Passkey List */}
      {loading && keys.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
          <RefreshCw size={16} className="mx-auto animate-spin mb-1 text-slate-400" />
          Loading passkeys…
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center space-y-1.5">
          <Fingerprint size={24} className="mx-auto text-slate-400" />
          <p className="text-xs font-semibold text-slate-700">No passkeys registered</p>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
            Add a passkey to sign in instantly with Touch ID, Face ID, Windows Hello, or a security key.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          {keys.map((key) => {
            const isEditing = editingId === key.id;
            const isBusy = actionLoadingId === key.id;
            const name = key.friendly_name || getDeviceDefaultName();

            return (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 text-xs gap-3 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                    <KeyRound size={15} />
                  </div>

                  <div className="min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 rounded border border-slate-300 px-2 text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                          placeholder="Passkey name"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRename(key.id)}
                          disabled={isBusy || !editName.trim()}
                          className="size-7 rounded bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="size-7 rounded border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900 truncate">{name}</span>
                        <button
                          onClick={() => {
                            setEditingId(key.id);
                            setEditName(name);
                          }}
                          className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          title="Rename passkey"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatDate(key.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => handleRemove(key.id)}
                    className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 size={12} className="mr-1" />
                    <span>Remove</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security Tip */}
      <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
        <ShieldCheck size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <span>
          Passkeys use public-key cryptography. Raw private keys never leave your device and are safe against phishing.
        </span>
      </div>
    </div>
  );
}
