"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Store, Truck, Settings2, Bell, Shield, Users, FileText, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "shopify", label: "Shopify", icon: Store },
  { id: "couriers", label: "Couriers", icon: Truck },
  { id: "dispatch", label: "Dispatch", icon: Settings2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "team", label: "Team", icon: Users },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "health", label: "Health", icon: Activity },
];

interface Props {
  activeTab: string;
  currentUserRole?: string;
  children: React.ReactNode;
}

export function SettingsTabs({ activeTab, currentUserRole, children }: Props) {
  const searchParams = useSearchParams();

  const tabs = [...TABS];
  if (currentUserRole === 'developer') {
    tabs.push({ id: "developer", label: "Developer", icon: Settings2 }); // Reusing Settings2 or similar
  }

  return (
    <div className="flex flex-col gap-5 md:flex-row md:gap-7 w-full min-w-0">
      {/* Sidebar nav — desktop */}
      <nav className="hidden md:flex flex-col gap-0.5 w-44 shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={`/settings?tab=${id}`}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === id
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon size={14} className="shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile tabs — horizontal scroll */}
      <div className="md:hidden -mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 pb-1 w-max">
          {tabs.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`/settings?tab=${id}`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                activeTab === id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Icon size={12} className="shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
