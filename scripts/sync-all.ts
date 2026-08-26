

import { createClient } from "@supabase/supabase-js";
import { ShopifySyncService } from "../src/services/synchronization/shopify-sync";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in .env.local (Ensure SUPABASE_SECRET_KEY is set)");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfill() {
  console.log("Starting Shopify Sync Backfill...");
  const { data: shops, error } = await supabase.from("shops").select("id, shop_domain");
  if (error || !shops) {
    console.error("Failed to fetch shops", error);
    process.exit(1);
  }

  console.log(`Found ${shops.length} shops. Reconciling...`);
  const syncService = new ShopifySyncService();

  for (const shop of shops) {
    console.log(`\nReconciling shop: ${shop.shop_domain} (${shop.id})`);
    try {
      const count = await syncService.reconcile(shop.id);
      console.log(`Successfully reconciled ${count} orders for ${shop.shop_domain}.`);
    } catch (err) {
      console.error(`Failed to reconcile shop ${shop.shop_domain}:`, err);
    }
  }

  console.log("\nBackfill complete.");
}

backfill();
