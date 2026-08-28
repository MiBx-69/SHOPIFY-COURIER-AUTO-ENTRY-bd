import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let supabaseUrl = "";
let supabaseKey = "";

for (const line of env.split("\n")) {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
    supabaseUrl = line.substring(line.indexOf("=") + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
  if (line.startsWith("SUPABASE_SECRET_KEY=")) {
    supabaseKey = line.substring(line.indexOf("=") + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: shops } = await supabase.from("shops").select("id").eq("shop_domain", "f1axic-dv.myshopify.com");
  if (!shops || shops.length === 0) return;
  const shopId = shops[0].id;
  
  const { data: install } = await supabase.from("shopify_installations").select("scopes, updated_at").eq("shop_id", shopId).single();
  console.log("Install:", install);
}

main();
