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
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-slate-50 md:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block lg:w-60 lg:p-5">
        <Link href="/orders" className="mb-6 flex items-center gap-2.5 px-1 group">
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
                "flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-xs font-semibold transition-all",
                active === label
                  ? "bg-slate-950 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="w-full min-w-0 flex-1 px-2.5 sm:px-4 md:px-6 lg:px-8 pt-2.5 sm:pt-4 pb-28 md:pb-8">
        <div className="mx-auto w-full max-w-6xl min-w-0">
          {children}
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation */}
      <nav 
        aria-label="Mobile Navigation"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 pt-1.5 backdrop-blur md:hidden shadow-lg"
      >
        {navigation.map(({ href, label, icon: Icon }) => {
          const isActive = active === label;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] font-medium transition-colors min-h-[44px]",
                isActive ? "text-slate-950 font-bold" : "text-slate-400 hover:text-slate-700"
              )}
            >
              <div className={cn(
                "flex size-6 items-center justify-center rounded-md transition-colors",
                isActive ? "bg-slate-100 text-slate-950" : "text-slate-400"
              )}>
                <Icon size={17} />
              </div>
              <span className="leading-tight text-[10px]">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


