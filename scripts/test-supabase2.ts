import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function check() {
  const { data: migrations, error } = await supabase.from('supabase_migrations.schema_migrations').select('*');
  console.log("Migrations:", migrations ? migrations.map(m => m.version) : error);
}

check();
