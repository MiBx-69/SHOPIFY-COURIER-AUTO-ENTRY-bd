import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function check() {
  const { data, error } = await supabase
    .from("shops")
    .select("id, redispatch_settings")
    .limit(1);

  console.log("Data:", data);
  console.log("Error:", error);
}

check();
