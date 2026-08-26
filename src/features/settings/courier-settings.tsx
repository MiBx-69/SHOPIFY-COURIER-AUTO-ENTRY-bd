"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/secret-input";
import { StatusBadge, type IntegrationStatus } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CourierConfig = {
  id: string;
  enabled: boolean;
  priority: number;
  connection_status: string;
  last_tested_at: string | null;
  last_test_latency_ms: number | null;
  last_error_message: string | null;
  credentials_last_updated_at: string | null;
  courier_id: string;
  couriers: { provider: string; display_name: string };
};

type ProviderField = {
  key: string;
  label: string;
  placeholder?: string;
  isSecret?: boolean;
  hint?: string;
  optional?: boolean;
};

// ─── Provider field definitions (public schema only — no default values) ──────

const PROVIDER_FIELDS: Record<string, ProviderField[]> = {
  redx: [
    { key: "apiToken", label: "API Access Token", placeholder: "your-redx-api-token", isSecret: true },
    { key: "baseUrl", label: "Base URL", placeholder: "https://api.redx.com.bd", optional: true, hint: "Override only if using a custom endpoint" }
  ],
  pathao: [
    { key: "clientId", label: "Client ID", placeholder: "your-pathao-client-id" },
    { key: "clientSecret", label: "Client Secret", placeholder: "your-pathao-client-secret", isSecret: true },
    { key: "username", label: "Username / Email", placeholder: "merchant@example.com" },
    { key: "password", label: "Password", placeholder: "your-pathao-password", isSecret: true },
    { key: "storeId", label: "Store ID", placeholder: "1234", hint: "Your Pathao merchant store ID" },
    { key: "senderName", label: "Sender Name", placeholder: "Your Store Name", optional: true },
    { key: "senderPhone", label: "Sender Phone", placeholder: "017XXXXXXXX", optional: true },
    { key: "baseUrl", label: "Base URL", placeholder: "https://api-hermes.pathao.com", optional: true }
  ],
  steadfast: [
    { key: "apiKey", label: "API Key", placeholder: "your-steadfast-api-key", isSecret: true },
    { key: "secretKey", label: "Secret Key", placeholder: "your-steadfast-secret-key", isSecret: true },
    { key: "baseUrl", label: "Base URL", placeholder: "https://portal.steadfast.com.bd", optional: true }
  ]
};

const PROVIDER_ICONS: Record<string, string> = {
  redx: "🔴",
  pathao: "🟢",
  steadfast: "🔵"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

// ─── Per-Courier Card ─────────────────────────────────────────────────────────

function CourierCard({
  config: initialConfig,
  shopId
}: {
  config: CourierConfig;
  shopId: string;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [expanded, setExpanded] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
    latencyMs?: number;
    testedAt?: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const provider = config.couriers.provider;
  const displayName = config.couriers.display_name;
  const fields = PROVIDER_FIELDS[provider] ?? [];
  const hasCredentials = Boolean(config.credentials_last_updated_at);
  const status = config.connection_status as IntegrationStatus;

  // ── API helpers ───────────────────────────────────────────────────────────

  async function testConnection() {
    setBusy(true);
    setTestResult(null);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/couriers/${config.id}/test`, { method: "POST" });
      const json = await res.json() as {
        data?: { connected: boolean; latencyMs: number; testedAt: string };
        error?: string;
      };
      if (res.ok && json.data?.connected) {
        setTestResult({ ok: true, msg: "Authentication successful", latencyMs: json.data.latencyMs, testedAt: json.data.testedAt });
        setConfig((c) => ({ ...c, connection_status: "connected", last_tested_at: json.data!.testedAt, last_test_latency_ms: json.data!.latencyMs, last_error_message: null }));
      } else {
        setTestResult({ ok: false, msg: json.error ?? "Connection test failed" });
        setConfig((c) => ({ ...c, connection_status: "failed" }));
      }
    } catch {
      setTestResult({ ok: false, msg: "Network error — please try again" });
    }
    setBusy(false);
  }

  async function saveCredentials() {
    setBusy(true);
    setStatusMsg(null);
    try {
      // Filter out empty optional fields
      const cleaned = Object.fromEntries(
        Object.entries(formValues).filter(([, v]) => v.trim() !== "")
      );
      const res = await fetch(`/api/couriers/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: cleaned })
      });
      const json = await res.json() as { error?: string };
      if (res.ok) {
        setStatusMsg("Credentials saved. Test the connection to verify.");
        setReplacing(false);
        setFormValues({});
        setConfig((c) => ({
          ...c,
          connection_status: "not_configured",
          credentials_last_updated_at: new Date().toISOString(),
          last_error_message: null
        }));
      } else {
        setStatusMsg(json.error ?? "Failed to save credentials");
      }
    } catch {
      setStatusMsg("Network error — please try again");
    }
    setBusy(false);
  }

  async function toggleEnabled() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/couriers/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !config.enabled })
      });
      const json = await res.json() as { data?: { enabled: boolean }; error?: string };
      if (res.ok && json.data) {
        setConfig((c) => ({ ...c, enabled: json.data!.enabled }));
        setStatusMsg(json.data.enabled ? `${displayName} enabled.` : `${displayName} disabled.`);
      } else {
        setStatusMsg(json.error ?? "Failed to update");
      }
    } catch {
      setStatusMsg("Network error — please try again");
    }
    setBusy(false);
  }

  async function removeConfig() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/couriers/${config.id}`, { method: "DELETE" });
      if (res.ok) {
        setStatusMsg("Removed.");
        // Reload page to refresh the list
        window.location.reload();
      } else {
        const json = await res.json() as { error?: string };
        setStatusMsg(json.error ?? "Failed to remove");
      }
    } catch {
      setStatusMsg("Network error — please try again");
    }
    setBusy(false);
    setConfirmDelete(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label={displayName}>
            {PROVIDER_ICONS[provider] ?? "📦"}
          </span>
          <div>
            <p className="font-semibold text-slate-900">{displayName}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <StatusBadge status={config.enabled ? status : "disabled"} />
              {config.last_tested_at && (
                <span className="text-xs text-slate-400">
                  Tested {fmt(config.last_tested_at)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasCredentials && (
            <Button
              variant="secondary"
              onClick={testConnection}
              disabled={busy}
              className="h-8 px-3 text-xs"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : "Test"}
            </Button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div
          className={cn(
            "flex items-center gap-2 border-t px-5 py-3 text-sm",
            testResult.ok
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-800"
          )}
        >
          {testResult.ok
            ? <CheckCircle2 size={15} className="shrink-0" />
            : <XCircle size={15} className="shrink-0" />}
          <span className="flex-1">{testResult.msg}</span>
          {testResult.latencyMs !== undefined && (
            <span className="text-xs opacity-70">{testResult.latencyMs} ms</span>
          )}
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          {/* Last error */}
          {config.last_error_message && !testResult && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <XCircle size={15} className="mt-0.5 shrink-0" />
              <span>{config.last_error_message}</span>
            </div>
          )}

          {/* Metadata grid */}
          <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-500 sm:grid-cols-3">
            <div>
              <p className="font-medium text-slate-700">Status</p>
              <p>{config.enabled ? "Enabled" : "Disabled"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">Priority</p>
              <p>{config.priority}</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">Last tested</p>
              <p>{fmt(config.last_tested_at)}</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">Response time</p>
              <p>{config.last_test_latency_ms != null ? `${config.last_test_latency_ms} ms` : "—"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">Credentials</p>
              <p>{hasCredentials ? `Saved ${fmt(config.credentials_last_updated_at)}` : "Not configured"}</p>
            </div>
          </div>

          {/* Credential display / replace form */}
          {!replacing ? (
            <div className="space-y-3">
              {hasCredentials && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">Saved credentials</p>
                  {fields.filter((f) => !f.optional || f.isSecret).slice(0, 2).map((field) => (
                    <div key={field.key} className="mb-2">
                      <label className="mb-1 block text-xs text-slate-500">{field.label}</label>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <span className="flex-1 font-mono text-sm tracking-widest text-slate-400">
                          ••••••••••••••••
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">saved</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="secondary"
                  onClick={() => { setReplacing(true); setFormValues({}); }}
                  disabled={busy}
                  className="h-8 px-3 text-xs"
                >
                  <RefreshCw size={12} className="mr-1.5" />
                  {hasCredentials ? "Replace credentials" : "Configure credentials"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={toggleEnabled}
                  disabled={busy}
                  className="h-8 px-3 text-xs"
                >
                  {config.enabled ? "Disable" : "Enable"}
                </Button>
                {confirmDelete ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={removeConfig}
                      disabled={busy}
                      className="h-8 px-3 text-xs text-red-600 hover:bg-red-50"
                    >
                      Confirm remove
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                      className="h-8 px-3 text-xs"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    className="h-8 px-3 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={12} className="mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* Replace / configure credentials form */
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Enter new credentials below. The existing credentials remain active until you save.
              </div>
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    {field.label}
                    {field.optional && (
                      <span className="ml-1 font-normal text-slate-400">(optional)</span>
                    )}
                  </label>
                  {field.isSecret ? (
                    <SecretInput
                      placeholder={field.placeholder}
                      value={formValues[field.key] ?? ""}
                      onChange={(e) =>
                        setFormValues((v) => ({ ...v, [field.key]: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      autoComplete="off"
                      className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                      value={formValues[field.key] ?? ""}
                      onChange={(e) =>
                        setFormValues((v) => ({ ...v, [field.key]: e.target.value }))
                      }
                    />
                  )}
                  {field.hint && (
                    <p className="mt-1 text-xs text-slate-400">{field.hint}</p>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={saveCredentials}
                  disabled={busy}
                  className="h-9"
                >
                  {busy && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                  Save credentials
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setReplacing(false); setFormValues({}); }}
                  disabled={busy}
                  className="h-9"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {statusMsg && (
            <p role="status" className="mt-3 text-sm text-slate-600">
              {statusMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyCourierCard({
  provider,
  displayName,
  courierId,
  shopId
}: {
  provider: string;
  displayName: string;
  courierId: string;
  shopId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fields = PROVIDER_FIELDS[provider] ?? [];

  async function createAndSave() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(formValues).filter(([, v]) => v.trim() !== "")
      );
      const res = await fetch(`/api/couriers?shopId=${encodeURIComponent(shopId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierId,
          enabled: true,
          priority: 50,
          credentials: cleaned
        })
      });
      const json = await res.json() as { error?: string };
      if (res.ok) {
        setStatusMsg("Courier configured. Refreshing…");
        window.location.reload();
      } else {
        setStatusMsg(json.error ?? "Failed to configure courier");
      }
    } catch {
      setStatusMsg("Network error — please try again");
    }
    setBusy(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label={displayName}>
            {PROVIDER_ICONS[provider] ?? "📦"}
          </span>
          <div>
            <p className="font-semibold text-slate-900">{displayName}</p>
            <StatusBadge status="not_configured" className="mt-0.5" />
          </div>
        </div>
        <Button
          variant="secondary"
          className="h-8 px-3 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          Configure
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          <p className="text-sm text-slate-500">
            Enter credentials to connect {displayName}. They are encrypted before storage.
          </p>
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {field.label}
                {field.optional && (
                  <span className="ml-1 font-normal text-slate-400">(optional)</span>
                )}
              </label>
              {field.isSecret ? (
                <SecretInput
                  placeholder={field.placeholder}
                  value={formValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFormValues((v) => ({ ...v, [field.key]: e.target.value }))
                  }
                />
              ) : (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={formValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFormValues((v) => ({ ...v, [field.key]: e.target.value }))
                  }
                />
              )}
              {field.hint && <p className="mt-1 text-xs text-slate-400">{field.hint}</p>}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button onClick={createAndSave} disabled={busy} className="h-9">
              {busy && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Save &amp; connect
            </Button>
            <Button variant="ghost" onClick={() => setExpanded(false)} disabled={busy} className="h-9">
              Cancel
            </Button>
          </div>
          {statusMsg && (
            <p role="status" className="text-sm text-slate-600">{statusMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type AllCourier = { id: string; provider: string; display_name: string };

export function CourierSettings({
  shopId,
  configs,
  allCouriers
}: {
  shopId: string;
  configs: CourierConfig[];
  allCouriers: AllCourier[];
}) {
  // Find couriers that don't have a config yet
  const configuredCourierIds = new Set(configs.map((c) => c.courier_id));
  const unconfigured = allCouriers.filter((c) => !configuredCourierIds.has(c.id));

  return (
    <div className="mt-4 space-y-3">
      {configs.map((config) => (
        <CourierCard key={config.id} config={config} shopId={shopId} />
      ))}
      {unconfigured.map((courier) => (
        <EmptyCourierCard
          key={courier.id}
          provider={courier.provider}
          displayName={courier.display_name}
          courierId={courier.id}
          shopId={shopId}
        />
      ))}
      {configs.length === 0 && unconfigured.length === 0 && (
        <p className="text-sm text-slate-500">No courier providers available.</p>
      )}
    </div>
  );
}
