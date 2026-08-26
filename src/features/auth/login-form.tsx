"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type View = "sign-in" | "forgot-password" | "check-email";

export function LoginForm() {
  const router = useRouter();
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Sign in ────────────────────────────────────────────────────────────────

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithPassword({ email, password });
    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Incorrect email or password. Please try again."
          : err.message
      );
    } else {
      router.push("/orders");
      router.refresh();
    }
    setBusy(false);
  }

  // ── Forgot password ────────────────────────────────────────────────────────

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });
    if (err) {
      setError(err.message);
    } else {
      setView("check-email");
    }
    setBusy(false);
  }

  // ── Check-email confirmation ───────────────────────────────────────────────

  if (view === "check-email") {
    return (
      <div className="w-full space-y-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
          ✉️
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We sent a password reset link to{" "}
            <span className="font-medium text-slate-800">{email}</span>.
            Click the link in the email to set a new password.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <button
            onClick={() => { setView("forgot-password"); setError(null); }}
            className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  // ── Forgot password form ───────────────────────────────────────────────────

  if (view === "forgot-password") {
    return (
      <div className="w-full space-y-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div>
          <button
            onClick={() => { setView("sign-in"); setError(null); }}
            className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back to sign in
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={requestReset} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Email address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send reset link <ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    );
  }

  // ── Sign-in form ───────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      {/* Brand */}
      <div>
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-xl text-white">
          📦
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Shopify Dispatch
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to manage your courier dispatches.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={signIn} className="space-y-4">
        {/* Email */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Email address
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <button
              type="button"
              onClick={() => { setView("forgot-password"); setError(null); }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-2"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {busy
            ? <Loader2 size={16} className="animate-spin" />
            : <>Sign in <ArrowRight size={15} /></>}
        </button>
      </form>

      {/* No sign-up notice */}
      <div className="border-t border-slate-100 pt-4 text-center">
        <p className="text-xs text-slate-400">
          Don&apos;t have an account?{" "}
          <a
            href="https://wa.me/8801605956421"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Contact developer on WhatsApp →
          </a>
        </p>
      </div>
    </div>
  );
}
