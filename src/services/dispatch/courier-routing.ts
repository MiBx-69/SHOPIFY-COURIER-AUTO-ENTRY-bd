import type { SupabaseClient } from "@supabase/supabase-js";

export type CourierRoutingCandidate = {
  id: string;
  enabled: boolean;
  connection_status: string;
  priority: number;
  provider: "redx" | "pathao" | "steadfast";
  display_name?: string;
};

type RoutingRule = {
  shipping_method_pattern: string;
  match_type: "exact" | "contains";
  courier_config_id: string;
  priority: number;
  enabled: boolean;
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function resolveCourierConfigId(
  admin: SupabaseClient,
  shopId: string,
  shippingMethod: string | null | undefined,
  shippingMethodCode: string | null | undefined,
  automaticCourier: boolean,
  explicitConfigId?: string
) {
  if (explicitConfigId) return explicitConfigId;
  if (!automaticCourier) return undefined;

  const { data: configs, error: configError } = await admin
    .from("courier_configs")
    .select("id,enabled,connection_status,priority,couriers(provider,display_name)")
    .eq("shop_id", shopId)
    .eq("enabled", true)
    .eq("connection_status", "connected")
    .order("priority", { ascending: true });

  if (configError) throw configError;

  const candidates: CourierRoutingCandidate[] = (configs || []).map((config: any) => ({
    id: config.id,
    enabled: Boolean(config.enabled),
    connection_status: config.connection_status,
    priority: Number(config.priority || 100),
    provider: config.couriers?.provider,
    display_name: config.couriers?.display_name
  }));

  if (!candidates.length) return undefined;

  const { data: shop } = await admin
    .from("shops")
    .select("shipping_method_routing_enabled")
    .eq("id", shopId)
    .single();

  if (shop?.shipping_method_routing_enabled) {
    const { data: rules, error: rulesError } = await admin
      .from("courier_routing_rules")
      .select("shipping_method_pattern,match_type,courier_config_id,priority,enabled")
      .eq("shop_id", shopId)
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (rulesError) throw rulesError;

    const method = normalize(shippingMethod);
    const code = normalize(shippingMethodCode);
    const matched = (rules as RoutingRule[] | null || []).find((rule) => {
      const pattern = normalize(rule.shipping_method_pattern);
      if (!pattern) return false;
      return rule.match_type === "exact"
        ? method === pattern || code === pattern
        : method.includes(pattern) || code.includes(pattern);
    });

    if (matched) {
      const configured = candidates.find((candidate) => candidate.id === matched.courier_config_id);
      if (configured) return configured.id;
      throw new Error(`Courier routing rule matched "${matched.shipping_method_pattern}", but that courier is not enabled and connected.`);
    }
  }

  // If routing is enabled but no rule matches, preserve the existing automatic
  // courier behavior: use the highest-priority connected courier.
  return candidates[0]?.id;
}
