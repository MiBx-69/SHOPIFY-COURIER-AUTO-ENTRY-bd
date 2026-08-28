import { createServerClient } from "@supabase/ssr";

// I can't use SSR client easily without a request. I will just construct a Supabase JS client with a mock JWT!
// Or I can just write a quick script that uses the admin client, but sets the auth context using a role.
import { createClient } from "@supabase/supabase-js";
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    global: {
      headers: {
        Authorization: `Bearer YOUR_MOCK_JWT` // Wait, I don't have a JWT
      }
    }
  }
);
