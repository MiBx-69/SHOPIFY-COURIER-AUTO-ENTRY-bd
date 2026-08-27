"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowRight, CheckCircle2, Fingerprint } from "lucide-react";
import { passkeyService } from "@/lib/auth/passkeys";
import { User } from "@supabase/supabase-js";

export default function AcceptInvitationPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"verify" | "password" | "passkey" | "done">("verify");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        setError("Invitation Required. This workspace is private and invitation-only.");
        setLoading(false);
        return;
      }

      setUser(session.user);
      setStep("password");
      setLoading(false);
    }
    checkSession();
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      setError(error.message);
      setBusy(false);
    } else {
      setBusy(false);
      setStep("passkey");
    }
  }

  async function handleSetupPasskey() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await passkeyService.register();
      if (error) {
        setError(error.message);
      } else {
        setStep("done");
        setTimeout(() => router.push("/orders"), 2000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to set up passkey.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 py-12">
        <Loader2 className="animate-spin text-white" size={32} />
      </main>
    );
  }

  if (error && step === "verify") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 py-12">
        <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invitation Required</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
          >
            Back to Sign In
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to MiBx-Dispatch</h1>
          {user?.app_metadata?.app_role && (
            <p className="mt-1">
              Role: <span className="font-semibold text-slate-700 uppercase">{user.app_metadata.app_role}</span>
            </p>
          )}
          <p className="mt-1 text-sm text-slate-500">
            Invited email: <span className="font-semibold text-slate-700">{user?.email}</span>
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {step === "password" && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Set a Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Save Password"}
            </button>
          </form>
        )}

        {step === "passkey" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-center">
              <Fingerprint className="mx-auto mb-2 text-blue-600" size={32} />
              <h3 className="text-sm font-semibold text-slate-900">Secure Account with Passkey</h3>
              <p className="mt-1 text-xs text-slate-600">
                Sign in faster using Touch ID, Face ID, or Windows Hello.
              </p>
            </div>
            <button
              onClick={handleSetupPasskey}
              disabled={busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Set up Passkey"}
            </button>
            <button
              onClick={() => {
                setStep("done");
                setTimeout(() => router.push("/orders"), 1000);
              }}
              disabled={busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 cursor-pointer"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-medium text-slate-900">Setup complete! Redirecting...</p>
          </div>
        )}
      </div>
    </main>
  );
}
