import Link from "next/link";
import Image from "next/image";
import { Activity, Package, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/dispatched", label: "Dispatched", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 md:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 md:block">
        <Link href="/orders" className="mb-7 flex items-center gap-3 px-1 group">
          <Image
            src="/logo.png"
            alt="MiBx-Dispatch"
            width={32}
            height={32}
            className="size-8 rounded-lg object-contain border border-slate-200/70 shadow-2xs shrink-0"
            priority
          />
          <div className="min-w-0 flex-1">
            <span className="font-bold text-slate-900 tracking-tight text-sm block leading-tight truncate">
              MiBx-Dispatch
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-tight block truncate">
              Logistics Terminal
            </span>
          </div>
        </Link>

        <nav className="space-y-1">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-xs font-semibold transition-all",
                active === label
                  ? "bg-slate-950 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 md:px-8 md:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 px-3 pt-2 backdrop-blur md:hidden">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors",
              active === label ? "text-slate-950" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

