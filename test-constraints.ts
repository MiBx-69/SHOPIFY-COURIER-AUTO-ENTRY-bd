import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

async function test() {
  const { data, error } = await supabase.rpc('test_dummy', {});
  // We can query pg_constraint
  const { data: constraints, error: cError } = await supabase
    .from("shops")
    .select("*")
    .limit(1);
    
  console.log("Constraints:", cError || constraints);
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
  const json = await res.json();
  console.log(json.definitions.shops);
}

test();
