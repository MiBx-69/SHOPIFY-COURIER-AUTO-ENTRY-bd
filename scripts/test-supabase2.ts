import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function check() {
  const { data, error } = await supabase.rpc('get_order_counts' as any, { shop_id: '2c0a237b-815e-4c32-981b-ba0a038fe1ff' });
  console.log("RPC Test:", data, error);
}

check();
