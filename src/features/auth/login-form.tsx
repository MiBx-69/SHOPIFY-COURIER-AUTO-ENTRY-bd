"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, Loader2, Fingerprint, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { passkeyService } from "@/lib/auth/passkeys";

type View = "sign-in" | "forgot-password" | "check-email";

export function LoginForm() {
  const router = useRouter();
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  // ── Primary: Passkey Sign In ───────────────────────────────────────────────

  async function handlePasskeySignIn() {
    setPasskeyBusy(true);
    setError(null);
    setInfoNotice(null);

    // Browser WebAuthn support check
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setError("Passkeys are not supported on this browser or device. Please sign in with your password below.");
      setPasskeyBusy(false);
      return;
    }

    try {
      const { data, error: err } = await passkeyService.signIn();

      if (err) {
        const msg = err.message || "";
        if (
          msg.includes("NotAllowedError") ||
          msg.includes("abort") ||
          msg.includes("cancel") ||
          msg.includes("User cancelled") ||
          msg.includes("user rejected")
        ) {
          setInfoNotice("Passkey authentication was cancelled.");
        } else if (
          msg.includes("not found") ||
          msg.includes("no credentials") ||
          msg.includes("Invalid login")
        ) {
          setError("No registered passkey found for this device. Please sign in with your email & password below to register one.");
        } else {
          setError(msg || "Passkey verification failed. Please try again or use your password.");
        }
      } else if (data?.session || data?.user) {
        window.location.href = "/orders";
        return;
      } else {
        window.location.href = "/orders";
        return;
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      if (
        errorObj.name === "NotAllowedError" ||
        errorObj.name === "AbortError" ||
        errorObj.message?.includes("cancelled")
      ) {
        setInfoNotice("Passkey authentication was cancelled.");
      } else {
        setError(errorObj.message || "Passkey authentication could not be completed.");
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  // ── Fallback: Password Sign In ─────────────────────────────────────────────

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfoNotice(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.error || "Incorrect email or password. Please try again.");
        setBusy(false);
        return;
      }

      window.location.href = "/orders";
    } catch (err: any) {
      console.error("Sign in error:", err);
      setError(err?.message || "Network error during sign in. Please try again.");
      setBusy(false);
    }
  }

  // ── Forgot password ────────────────────────────────────────────────────────

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfoNotice(null);

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
      <div className="w-full space-y-6 rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
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
            onClick={() => { setView("forgot-password"); setError(null); setInfoNotice(null); }}
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
      <div className="w-full space-y-6 rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div>
          <button
            onClick={() => { setView("sign-in"); setError(null); setInfoNotice(null); }}
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
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer shadow-sm"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send reset link <ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    );
  }

  // ── Sign-in form ───────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6 rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-slate-100/80">
      {/* Brand Header */}
      <div className="text-center">
        <Image
          src="/logo.png"
          alt="MiBx-Dispatch"
          width={64}
          height={64}
          className="mx-auto size-16 rounded-2xl object-contain shadow-md border border-slate-200/80 mb-3"
          priority
        />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          MiBx-Dispatch
        </h1>
        <p className="mt-1 text-xs font-semibold text-blue-600 tracking-tight">
          Sync. • Dispatch. • Deliver. • Done.
        </p>
      </div>

      {/* Notices */}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-700 leading-relaxed">
          {error}
        </div>
      )}

      {infoNotice && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
          {infoNotice}
        </div>
      )}

      {/* ── PRIMARY LOGIN: Passkey ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handlePasskeySignIn}
          disabled={passkeyBusy || busy}
          className="group relative flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition-all hover:bg-slate-800 hover:shadow-md active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {passkeyBusy ? (
            <>
              <Loader2 size={18} className="animate-spin text-blue-400" />
              <span>Verifying Passkey…</span>
            </>
          ) : (
            <>
              <Fingerprint size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
              <span>Continue with Passkey</span>
            </>
          )}
        </button>
        <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
          <KeyRound size={11} />
          Touch ID, Face ID, Windows Hello, or Security Key
        </p>
      </div>

      {/* ── DIVIDER ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-slate-200" />
        <span className="absolute bg-white px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
          or sign in with password
        </span>
      </div>

      {/* ── SECONDARY FALLBACK: Email & Password Form ───────────────────────── */}
      <form onSubmit={signInWithPassword} className="space-y-3.5">
        {/* Email */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Email address
          </label>
          <div className="relative">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">Password</label>
            <button
              type="button"
              onClick={() => { setView("forgot-password"); setError(null); setInfoNotice(null); }}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline underline-offset-2 cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={busy || passkeyBusy}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-semibold transition-all disabled:opacity-60 cursor-pointer"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <>Sign In with Password <ArrowRight size={13} /></>}
        </button>
      </form>

      {/* Invitation Notice */}
      <div className="border-t border-slate-100 pt-4 text-center space-y-2">
        <p className="text-[11px] text-slate-500 font-medium">
          This is a private, invite-only application.
        </p>
        <p className="text-xs text-slate-700">
          Have an invitation?{" "}
          <button
            type="button"
            onClick={() => router.push("/accept-invitation")}
            className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2 cursor-pointer"
          >
            Accept Invitation
          </button>
        </p>
      </div>
    </div>
  );
}
