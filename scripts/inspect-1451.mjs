import { createAdminClient } from "./src/lib/supabase/admin";

async function inspectOrder() {
  const admin = createAdminClient();
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, name, shop_id, customer_name, customer_phone, dispatch_status, cancelled_at, is_skipped, total_minor, currency")
    .ilike("name", "%1451%");

  console.log("=== ORDERS MATCHING #1451 ===");
  console.log(JSON.stringify(orders, null, 2));

  if (orders && orders.length > 0) {
    const order = orders[0];
    const { data: dispatches } = await admin
      .from("dispatches")
      .select("*")
      .eq("order_id", order.id);

    console.log("=== DISPATCHES FOR ORDER ===");
    console.log(JSON.stringify(dispatches, null, 2));

    const { data: attempts } = await admin
      .from("dispatch_attempts")
      .select("*")
      .eq("shop_id", order.shop_id)
      .order("started_at", { ascending: false })
      .limit(5);

    console.log("=== RECENT DISPATCH ATTEMPTS ===");
    console.log(JSON.stringify(attempts, null, 2));

    const { data: shipments } = await admin
      .from("courier_shipments")
      .select("*")
      .eq("shop_id", order.shop_id);

    console.log("=== COURIER SHIPMENTS FOR SHOP ===");
    console.log(JSON.stringify(shipments, null, 2));
  }
}

inspectOrder().catch(console.error);
