"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase sends the user to this page with a hash fragment containing the
  // access/refresh token. The client SDK reads it automatically on mount.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    if (err) {
      setError(err.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/orders"), 2500);
    }
    setBusy(false);
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (done) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-center space-y-4">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">Password updated</h1>
          <p className="text-sm text-slate-500">Signing you in…</p>
        </div>
      </main>
    );
  }

  // ── Not ready (no PASSWORD_RECOVERY event yet) ─────────────────────────────

  if (!sessionReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-center space-y-4">
          <Loader2 size={32} className="mx-auto animate-spin text-slate-400" />
          <p className="text-sm text-slate-500">Verifying your reset link…</p>
          <p className="text-xs text-slate-400">
            If this takes too long, the link may have expired.{" "}
            <a href="/login" className="underline text-slate-600 hover:text-slate-900">
              Back to sign in
            </a>
          </p>
        </div>
      </main>
    );
  }

  // ── Set new password form ─────────────────────────────────────────────────

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 space-y-6">
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-xl text-white">
              🔑
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Set new password
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose a strong password for your account.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                New password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              {confirm && password !== confirm && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
                  <XCircle size={12} /> Passwords don&apos;t match
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || (confirm.length > 0 && password !== confirm)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Update password"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Shopify Multi-Courier Dispatch Platform
        </p>
      </div>
    </main>
  );
}
