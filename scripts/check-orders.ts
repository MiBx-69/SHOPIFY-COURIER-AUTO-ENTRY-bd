import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// Poor man's dotenv parsing for scratch script
const env = fs.readFileSync(".env.local", "utf8");
let url = "";
let key = "";
env.split("\n").forEach(line => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1].trim();
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1].trim();
});

const supabase = createClient(url, key);

async function check() {
  const { data } = await supabase.from('orders')
    .select('id, shop_id, order_number, fulfillment_status, dispatch_status, shopify_order_id, shopify_order_gid')
    .in('order_number', [1412, 1411, 1410, 1408, 1406, 1405, 1404]);
  console.log(JSON.stringify(data, null, 2));
}

check();
