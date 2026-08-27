const fs = require('fs');
let code = fs.readFileSync('src/app/settings/page.tsx', 'utf-8');

code = code.replace('import { unstable_cache } from "next/cache";', 'import { unstable_cache } from "next/cache";\nimport { Suspense } from "react";');

code = code.replace(/  \/\/ Parallelize the queries that depend on \shop\[\s\S]*?allCouriers = allCouriersRes;/m, \  let membership: { role: string } | null = null;
  if (shop) {
    const { data } = await admin.from("memberships").select("role").eq("user_id", user.id).limit(1).maybeSingle();
    membership = data;
  }\);

code = code.replace(/  \/\/ Team members[\\s\\S]*?invitations\\.push\\(\\.\\.\\.orgInvitations\\);\n    }\n  }/m, '  // Team members moved to TeamTabAsync');

code = code.replace(/<CourierSettings[\\s\\S]*?\\/>/, \<Suspense fallback={<div className="py-8 text-center text-sm text-slate-500">Loading courier services...</div>}>
              <CouriersTabAsync shopId={shop.id} />
            </Suspense>\);

code = code.replace(/<DispatchSettings[\\s\\S]*?\\/>/, \<Suspense fallback={<div className="py-8 text-center text-sm text-slate-500">Loading dispatch settings...</div>}>
              <DispatchTabAsync shopId={shop.id} automatic_courier={shop.automatic_courier} />
            </Suspense>\);

code = code.replace(/<TeamSettings[\\s\\S]*?\\/>/, \<Suspense fallback={<div className="py-8 text-center text-sm text-slate-500">Loading team settings...</div>}>
              <TeamTabAsync shopId={shop.id} orgId={shop.organization_id} currentUserId={user.id} currentUserRole={currentUserRole} />
            </Suspense>\);

code += \

// --- Async Tab Components ---

async function CouriersTabAsync({ shopId }: { shopId: string }) {
  const admin = createAdminClient();
  const supabase = await createServerSupabaseClient();
  const [courierConfigsRes, allCouriersRes] = await Promise.all([
    supabase
      .from("courier_configs")
      .select('id,enabled,priority,connection_status,last_tested_at,last_test_latency_ms,last_error_message,credentials_last_updated_at,courier_id,couriers(provider,display_name)')
      .eq("shop_id", shopId)
      .order("priority"),
    getAllCouriers()
  ]);

  return (
    <CourierSettings
      shopId={shopId}
      configs={(courierConfigsRes.data ?? []) as any}
      allCouriers={(allCouriersRes ?? []) as any}
    />
  );
}

async function DispatchTabAsync({ shopId, automatic_courier }: { shopId: string, automatic_courier: any }) {
  const supabase = await createServerSupabaseClient();
  const { data: courierConfigs } = await supabase
    .from("courier_configs")
    .select('id,enabled,priority,connection_status,last_tested_at,last_test_latency_ms,last_error_message,credentials_last_updated_at,courier_id,couriers(provider,display_name)')
    .eq("shop_id", shopId)
    .order("priority");

  return (
    <DispatchSettings
      shopId={shopId}
      initialAutomatic={Boolean(automatic_courier)}
      configs={(courierConfigs ?? []) as any}
    />
  );
}

async function TeamTabAsync({ shopId, orgId, currentUserId, currentUserRole }: { shopId: string, orgId: string, currentUserId: string, currentUserRole: string }) {
  const admin = createAdminClient();
  const supabase = await createServerSupabaseClient();
  
  const members: Array<any> = [];
  const invitations: Array<any> = [];

  const [{ data: orgMemberships }, { data: orgInvitations }, { data: { users } }] = await Promise.all([
    admin.from("memberships").select("id,user_id,role,created_at,profiles(full_name)").eq("organization_id", orgId),
    supabase.from("organization_invitations").select("id, email, role, status, created_at, expires_at").eq("organization_id", orgId).neq("status", "accepted").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 })
  ]);
    
  if (orgMemberships) {
    const userMap = new Map(users.map((u) => [u.id, u]));
    for (const m of orgMemberships as any[]) {
      const authUser = userMap.get(m.user_id);
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      members.push({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        email: authUser?.email,
        full_name: profile?.full_name ?? undefined,
        created_at: m.created_at,
      });
    }
  }

  if (orgInvitations) {
    invitations.push(...orgInvitations);
  }

  return (
    <TeamSettings
      organizationId={orgId}
      members={members}
      invitations={invitations}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
    />
  );
}
\;

fs.writeFileSync('src/app/settings/page.tsx', code);
