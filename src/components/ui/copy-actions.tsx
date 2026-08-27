"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Phone, Mail, MapPin, Tag } from "lucide-react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      title={label ? `Copy ${label}` : "Copy"}
      className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 transition-all select-none ${
        copied
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 active:scale-95"
      } ${className}`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied!" : (label ?? "Copy")}
    </button>
  );
}

// ─── Phone Actions ────────────────────────────────────────────────────────────
interface PhoneActionsProps {
  phone: string;
  compact?: boolean;
}

export function PhoneActions({ phone, compact = false }: PhoneActionsProps) {
  if (!phone) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <CopyButton value={phone} label="Copy" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <CopyButton value={phone} label="Copy" />
      <a
        href={`tel:${phone}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
      >
        <Phone size={10} />
        Call
      </a>
    </div>
  );
}

// ─── Quick Customer Actions ───────────────────────────────────────────────────
interface CustomerActionsProps {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  trackingId?: string | null;
  orderName?: string | null;
}

export function CustomerActions({ phone, email, address, trackingId, orderName }: CustomerActionsProps) {
  return (
    <div className="space-y-2.5 text-xs">
      {phone && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
            <Phone size={12} className="shrink-0 text-slate-400" />
            <span className="font-mono truncate">{phone}</span>
          </div>
          <PhoneActions phone={phone} />
        </div>
      )}

      {email && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
            <Mail size={12} className="shrink-0 text-slate-400" />
            <span className="truncate">{email}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <CopyButton value={email} label="Copy" />
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Mail size={10} />
              Email
            </a>
          </div>
        </div>
      )}

      {address && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 text-slate-600 min-w-0">
            <MapPin size={12} className="shrink-0 text-slate-400 mt-0.5" />
            <span className="line-clamp-2">{address}</span>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <CopyButton value={address} label="Copy" />
          </div>
        </div>
      )}

      {trackingId && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
            <Tag size={12} className="shrink-0 text-slate-400" />
            <span className="font-mono truncate">{trackingId}</span>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <CopyButton value={trackingId} label="Copy" />
          </div>
        </div>
      )}

      {orderName && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="font-mono font-semibold">{orderName}</span>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <CopyButton value={orderName} label="Copy #" />
          </div>
        </div>
      )}
    </div>
  );
}
