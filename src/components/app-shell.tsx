"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  Activity, 
  Package, 
  Settings, 
  PanelLeftClose, 
  PanelLeftOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/dispatched", label: "Dispatched", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mibx_sidebar_collapsed");
    if (saved !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollapsed(saved === "true");
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("mibx_sidebar_collapsed", String(next));
      return next;
    });
  };

  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-slate-50 md:flex">
      {/* Desktop Sidebar (Collapsible) */}
      <aside 
        className={cn(
          "hidden shrink-0 border-r border-slate-200 bg-white transition-all duration-300 ease-in-out md:flex md:flex-col justify-between relative",
          isCollapsed ? "w-16 p-3" : "w-52 lg:w-56 p-4"
        )}
      >
        <div>
          {/* Brand Header & Toggle */}
          <div className={cn("mb-5 flex items-center justify-between gap-1.5 px-0.5", isCollapsed && "justify-center")}>
            <Link 
              href="/orders" 
              className={cn(
                "flex items-center gap-2.5 group overflow-hidden transition-all",
                isCollapsed && "justify-center"
              )}
              title="MiBx-Dispatch"
            >
              <Image
                src="/logo.png"
                alt="MiBx-Dispatch"
                width={32}
                height={32}
                className="size-8 rounded-lg object-contain border border-slate-200/70 shadow-2xs shrink-0"
                priority
              />
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 tracking-tight text-sm block leading-tight truncate">
                    MiBx-Dispatch
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium tracking-tight block truncate">
                    Logistics Terminal
                  </span>
                </div>
              )}
            </Link>

            {/* Collapse Toggle Button (Top Right when expanded) */}
            {!isCollapsed && (
              <button
                type="button"
                onClick={toggleCollapse}
                title="Collapse sidebar to maximize screen"
                className="size-7 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer shadow-2xs"
              >
                <PanelLeftClose size={14} />
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navigation.map(({ href, label, icon: Icon }) => {
              const isActive = active === label;
              return (
                <Link
                  key={href}
                  href={href}
                  title={isCollapsed ? label : undefined}
                  className={cn(
                    "flex min-h-9 items-center rounded-xl font-semibold transition-all relative group",
                    isCollapsed 
                      ? "justify-center px-0 w-10 mx-auto" 
                      : "gap-2.5 px-3 text-xs",
                    isActive
                      ? "bg-slate-950 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  {!isCollapsed && (
                    <span className="truncate">{label}</span>
                  )}

                  {/* Floating tooltip on hover when collapsed */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg whitespace-nowrap z-50">
                      {label}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Expand Toggle (When collapsed) */}
        {isCollapsed && (
          <div className="pt-3 border-t border-slate-100 flex justify-center">
            <button
              type="button"
              onClick={toggleCollapse}
              title="Expand sidebar"
              className="size-8 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
            >
              <PanelLeftOpen size={15} />
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Top Header (Visible only on small screens) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden shadow-xs">
        <Link href="/orders" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="MiBx-Dispatch Logo"
            width={24}
            height={24}
            className="size-6 rounded object-contain border border-slate-200/70"
            priority
          />
          <div className="flex flex-col leading-none">
            <span className="font-bold text-slate-900 text-xs">MiBx-Dispatch</span>
            <span className="text-[9px] text-slate-400 font-medium">Logistics Terminal</span>
          </div>
        </Link>
      </header>

      {/* Main Content Area - Expands to full screen */}
      <main className="w-full min-w-0 flex-1 px-2.5 sm:px-4 md:px-5 lg:px-6 pt-2.5 sm:pt-4 pb-28 md:pb-8">
        <div className="mx-auto w-full max-w-[1920px] min-w-0">
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
