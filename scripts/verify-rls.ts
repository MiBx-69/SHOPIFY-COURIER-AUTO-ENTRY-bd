import { readFile } from "node:fs/promises";
async function main() {
  const sql = await readFile("supabase/migrations/20260826071344_initial_platform_schema.sql", "utf8");
  const tenantTables = ["profiles","organizations","memberships","shops","orders","order_line_items","order_events","courier_configs","dispatches","dispatch_attempts","courier_shipments","courier_tracking_events","webhook_events","sync_jobs","sync_errors","audit_logs","saved_filters","order_internal_notes","security_events","shopify_installations","courier_secrets"];
  const missing = tenantTables.filter((table) => !sql.includes(`alter table public.${table} enable row level security`));
  if (missing.length) throw new Error(`RLS missing for: ${missing.join(", ")}`);
  if (sql.includes("service_role") || sql.includes("grant all on all tables")) throw new Error("Unsafe database privilege detected");
  console.log(`RLS audit passed for ${tenantTables.length} tenant/security tables.`);
}
void main();
