
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function run() {
  console.log("Testing is_skipped column on orders...");
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, is_skipped")
    .limit(1);

  if (ordersError) {
    console.error("Orders Error:", ordersError);
  } else {
    console.log("Orders Success! is_skipped exists.");
  }

  console.log("\nTesting get_order_counts RPC...");
  // Using a dummy UUID for shop_id
  const dummyShopId = "2c0a237b-815e-4c32-981b-ba0a038fe1ff";
  const { data: counts, error: countsError } = await supabase
    .rpc("get_order_counts", { p_shop_id: dummyShopId })
    .single();

  if (countsError) {
    console.error("Counts Error:", countsError);
  } else {
    console.log("Counts Success! Results:", counts);
  }
}

run();
