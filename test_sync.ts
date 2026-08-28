import { createAdminClient } from "@/lib/supabase/admin";
import { ShopifySyncService } from "@/services/synchronization/shopify-sync";

async function runSyncTest() {
  try {
    const admin = createAdminClient();
    const { data: shops } = await admin.from("shops").select("id, name, shop_domain");
    const shopId = shops![0].id;

    console.log(`Running Shopify sync for shop ${shops![0].name}...`);
    const service = new ShopifySyncService();
    const count = await service.syncOrders(shopId, "updated_at:>=2026-08-20");
    console.log(`✅ Sync successful! Synchronized ${count} orders.`);

    // Query updated orders from database
    const { data: orders } = await admin
      .from("orders")
      .select("name, fulfillment_status, financial_status, shopify_updated_at")
      .in("name", ["#1486", "#1485", "#1484", "#1483", "#1482", "#1481", "#1480", "#1479", "#1478", "#1477", "#1471", "#1470"])
      .order("order_number", { ascending: false });

    console.log("Updated orders in DB:\n", orders);
  } catch (err: any) {
    console.error("Detailed sync error:", err);
  }
}

runSyncTest();
