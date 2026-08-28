import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function check() {
  const { data: cols, error: err2 } = await supabase.from('shops').select('*').limit(1);
  console.log("Shops cols via REST:", cols ? Object.keys(cols[0]) : null);
  
  // Try to use a raw query if they have a postgres function, or let's just insert one?
  // Let's create an RPC to execute raw SQL. But I can't do that if the cache is stale!
}

check();
