import { createAdminClient } from "@/lib/supabase/admin";

export async function test() {
  const admin = createAdminClient();
  const userId = "e23a7e91-626d-4cbf-9f68-0df642b39d72";
  const orgId = "e7343394-4a48-4e56-bb02-ff66db6aec09";

  const { data, error } = await admin
    .from('memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  console.log({ data, error });
}
test().catch(console.error);
