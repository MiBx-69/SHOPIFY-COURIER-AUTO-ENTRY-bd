import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const migrationsDir = "supabase/migrations";
  const files = await readdir(migrationsDir);
  files.sort();

  // 1. Existing RLS check
  const sql = await readFile(path.join(migrationsDir, "20260826071344_initial_platform_schema.sql"), "utf8");
  const tenantTables = ["profiles","organizations","memberships","shops","orders","order_line_items","order_events","courier_configs","dispatches","dispatch_attempts","courier_shipments","courier_tracking_events","webhook_events","sync_jobs","sync_errors","audit_logs","saved_filters","order_internal_notes","security_events","shopify_installations","courier_secrets"];
  const missing = tenantTables.filter((table) => !sql.includes(`alter table public.${table} enable row level security`));
  if (missing.length) throw new Error(`RLS missing for: ${missing.join(", ")}`);
  
  if (sql.includes("grant all on all tables")) throw new Error("Unsafe database privilege detected");
  console.log(`RLS audit passed for ${tenantTables.length} tenant/security tables.`);

  // 2. New RPC Tenant-check audit
  let fullSql = "";
  for (const file of files) {
    if (file.endsWith(".sql")) {
      fullSql += await readFile(path.join(migrationsDir, file), "utf8") + "\n";
    }
  }

    const functionDefs = new Map<string, string>();
  const regex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)\s*\(([^)]*)\)[\s\S]*?\$\$([\s\S]*?)\$\$\s*LANGUAGE\s+plpgsql\s+(SECURITY DEFINER)/gi;
  let match;
  while ((match = regex.exec(fullSql)) !== null) {
    const fnName = match[1].toLowerCase();
    const args = match[2].toLowerCase();
    const body = match[3];
    
    if (args.includes("shop_id") || args.includes("org_id")) {
       functionDefs.set(fnName, body);
    }
  }
  
  let failed = 0;
  let passed = 0;
  for (const [name, body] of functionDefs.entries()) {
    if (!body.includes("private.has_permission") && !body.includes("private.has_shop_access")) {
      console.error(`❌ Function ${name} is SECURITY DEFINER but missing tenant guard!`);
      failed++;
    } else {
      passed++;
    }
  }

  if (failed > 0) {
    throw new Error(`Tenant-check audit failed. ${failed} functions missing guards.`);
  }

  console.log(`Tenant-check audit passed for ${passed} shop-scoped SQL function(s).`);
}

void main();
