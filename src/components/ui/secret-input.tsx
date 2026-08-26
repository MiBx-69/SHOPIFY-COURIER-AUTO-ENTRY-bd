"use client";
import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** When true the field renders as a placeholder-only display (existing secret) */
  masked?: boolean;
}

/**
 * A secure credential input that:
 * - Always renders as type="password" until the user toggles visibility
 * - Never autofills (new-password autocomplete)
 * - Shows a clear "Enter new value" label when in replacement mode
 * - Never reveals an existing secret — only new values entered by the user
 */
export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(
  ({ masked, className, placeholder, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    if (masked) {
      // Read-only masked display for existing credentials — shows no value
      return (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="flex-1 font-mono text-sm tracking-widest text-slate-500">
            ••••••••••••••••
          </span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
            saved
          </span>
        </div>
      );
    }

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder ?? "Enter new value"}
          className={cn(
            "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 pr-10 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-slate-900",
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide value" : "Show value"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  }
);
SecretInput.displayName = "SecretInput";
