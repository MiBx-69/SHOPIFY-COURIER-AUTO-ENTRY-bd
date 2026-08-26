import { LoginForm } from "@/features/auth/login-form";

export const metadata = { title: "Sign In | MiBx-Dispatch" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 py-12 relative overflow-hidden">
      {/* Subtle ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <LoginForm />
        <p className="mt-6 text-center text-xs text-slate-500 font-medium">
          MiBx-Dispatch · Sync. • Dispatch. • Deliver. • Done.
        </p>
      </div>
    </main>
  );
}

