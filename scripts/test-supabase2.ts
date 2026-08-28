import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function check() {
  const { data, error } = await supabase.rpc('get_schema_version' as any); // Try a random RPC to see if it exists
  
  // Actually let's try to do a raw SQL query if they have one, or just check what columns are available
  const { data: cols, error: err2 } = await supabase.from('shops').select('*').limit(1);
  console.log("Columns:", cols ? Object.keys(cols[0]) : null);
}

check();
