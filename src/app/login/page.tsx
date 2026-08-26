import { LoginForm } from "@/features/auth/login-form";

export const metadata = { title: "Sign In — Shopify Dispatch" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <LoginForm />
        <p className="mt-6 text-center text-xs text-slate-400">
          Shopify Multi-Courier Dispatch Platform
        </p>
      </div>
    </main>
  );
}
