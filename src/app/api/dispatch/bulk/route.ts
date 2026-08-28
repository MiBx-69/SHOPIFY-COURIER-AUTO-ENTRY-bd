import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { bulkDispatchSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { resolveCourierForOrder, type ShippingRoutingRule, type CourierCandidateInfo } from "@/services/courier/routing";
import { PickupLocationService } from "@/services/courier/pickup-locations";

// ─── Concurrency-limited pool ─────────────────────────────────────────────────
// Runs `handler` for each item but limits simultaneous executions to `concurrency`.
async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  handler: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await handler(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    const input = bulkDispatchSchema.parse(await request.json());
    const admin = createAdminClient();

    // 1. Fetch user's authorized shops
    const { data: memberships } = await admin
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", user.id);

    const allowedRoles = ["owner", "admin", "manager", "dispatcher"];
    const authorizedOrgIds = (memberships || [])
      .filter((m: { organization_id: string; role: string }) => allowedRoles.includes(m.role))
      .map((m: { organization_id: string }) => m.organization_id);

    if (!authorizedOrgIds.length) {
      return NextResponse.json({ error: "Unauthorized to dispatch orders" }, { status: 403 });
    }

    const { data: shops } = await admin
      .from("shops")
      .select("id, organization_id, shipping_rules, redispatch_settings")
      .in("organization_id", authorizedOrgIds);

    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));
    const shopOrgMap = new Map(
      (shops || []).map((s: { id: string; organization_id: string }) => [s.id, s.organization_id])
    );
    const shopConfigMap = new Map(
      (shops || []).map((s) => [s.id, s])
    );

    type OrderRecord = {
      id: string;
      name: string;
      shop_id: string;
      customer_phone: string | null;
      shipping_address: Record<string, unknown> | null;
      shipping_lines: Array<{ title: string; code?: string | null }> | null;
      shipping_title: string | null;
      dispatch_status: string;
      cancelled_at: string | null;
      total_minor: number;
      currency: string;
    };

    // 2. Fetch the orders being dispatched
    const { data: orders } = await admin
      .from("orders")
      .select("id, name, shop_id, customer_phone, shipping_address, shipping_lines, shipping_title, dispatch_status, cancelled_at, total_minor, currency")
      .in("id", input.orderIds);

    const orderMap = new Map(
      (((orders || []) as unknown) as OrderRecord[]).map((o) => [o.id, o])
    );

    const targetShopIds = Array.from(new Set((orders || []).map((o) => o.shop_id)));

    // Fetch courier candidate configurations for all relevant shops
    const { data: configs } = await admin
      .from("courier_configs")
      .select("id, shop_id, priority, enabled, connection_status, couriers(provider,display_name)")
      .in("shop_id", targetShopIds);

    const configsByShop = new Map<string, CourierCandidateInfo[]>();
    for (const c of configs || []) {
      const provider = (c.couriers as any)?.provider;
      const displayName = (c.couriers as any)?.display_name;
      const item: CourierCandidateInfo = {
        id: c.id,
        provider,
        displayName: displayName || provider?.toUpperCase(),
        enabled: c.enabled,
        priority: c.priority,
        connectionStatus: c.connection_status
      };
      const list = configsByShop.get(c.shop_id) || [];
      list.push(item);
      configsByShop.set(c.shop_id, list);
    }

    const dispatchService = new DispatchService();

    type OrderResult = {
      orderId: string;
      orderName: string;
      status: "dispatched" | "failed" | "skipped";
      trackingId?: string;
      courierName?: string;
      reason?: string;
    };

    // 3. Process orders with controlled concurrency (max 5 simultaneous)
    const results = await runWithConcurrency<string, OrderResult>(
      input.orderIds,
      5,
      async (orderId) => {
        const order = orderMap.get(orderId);

        // Security: order must exist and belong to an authorized shop
        if (!order || !authorizedShopIds.has(order.shop_id)) {
          return { orderId, orderName: order?.name || "Order", status: "failed", reason: "Order not found or unauthorized" };
        }

        if (order.cancelled_at) {
          return { orderId, orderName: order.name, status: "skipped", reason: "Order is cancelled in Shopify" };
        }

        if (order.dispatch_status === "dispatched") {
          return { orderId, orderName: order.name, status: "skipped", reason: "Already dispatched" };
        }

        if (!order.customer_phone || !order.shipping_address) {
          return { orderId, orderName: order.name, status: "failed", reason: "Missing phone number or delivery address" };
        }

        // Per-order Courier & Pickup Location Resolution
        const shop = shopConfigMap.get(order.shop_id);
        const candidates = configsByShop.get(order.shop_id) || [];
        const shippingRules = ((shop as any)?.shipping_rules || []) as ShippingRoutingRule[];

        let chosenConfigId = input.courierConfigId;
        let chosenPickupLocationId = input.pickupLocationId;

        // If no explicit manual courier override, resolve automatically based on Inside/Outside Dhaka rules & shipping rules
        if (!chosenConfigId) {
          const resolved = resolveCourierForOrder(order, shippingRules, candidates);
          if (resolved) {
            chosenConfigId = resolved.courierConfigId;
            chosenPickupLocationId = chosenPickupLocationId || resolved.pickupLocationId;
          } else {
            const firstEnabled = candidates.find((c) => c.enabled && c.connectionStatus === "connected");
            if (firstEnabled) {
              chosenConfigId = firstEnabled.id;
            }
          }
        }

        if (!chosenConfigId) {
          return { 
            orderId, 
            orderName: order.name, 
            status: "failed", 
            reason: "No enabled and connected courier service available for this location" 
          };
        }

        // If pickup location not specified, fetch default location for this courier
        if (!chosenPickupLocationId) {
          try {
            const locData = await PickupLocationService.get(chosenConfigId, order.shop_id);
            const defaultLoc = locData.locations?.find((l) => l.id === locData.defaultLocationId || l.isDefault) || locData.locations?.[0];
            chosenPickupLocationId = defaultLoc?.id;
          } catch {
            // ignore error, will be validated in dispatch service
          }
        }

        // Claim dispatch lock idempotently via Supabase RPC
        const idempotencyKey = crypto.randomUUID();
        const { data: claim, error: claimError } = await supabase.rpc("claim_dispatch", {
          p_order_id: orderId,
          p_idempotency_key: idempotencyKey
        });

        if (claimError || !claim) {
          return { orderId, orderName: order.name, status: "skipped", reason: "Dispatch already in progress or already processed" };
        }

        try {
          const execution = await dispatchService.execute(
            claim.id,
            chosenConfigId,
            chosenPickupLocationId,
            user.id
          );

          if (!execution.success) {
            return { orderId, orderName: order.name, status: "failed", reason: execution.error || "Courier rejected shipment creation" };
          }

          return {
            orderId,
            orderName: order.name,
            status: "dispatched" as const,
            trackingId: execution.trackingId,
            courierName: execution.courierName,
          };
        } catch (execErr) {
          return {
            orderId,
            orderName: order.name,
            status: "failed" as const,
            reason: execErr instanceof Error ? execErr.message : "Dispatch execution failed"
          };
        }
      }
    );

    const dispatched = results.filter((r) => r.status === "dispatched").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    // 5. Audit log for bulk dispatch (non-blocking)
    const shopId = orderMap.get(input.orderIds[0])?.shop_id;
    const orgId = shopId ? shopOrgMap.get(shopId) : undefined;
    if (shopId && orgId) {
      (async () => {
        try {
          const { invalidateCountsCache } = await import("@/lib/redis");
          await invalidateCountsCache([shopId]);
          
          await admin.from("audit_logs").insert({
            organization_id: orgId,
            shop_id: shopId,
            actor_id: user.id,
            action: "dispatch.bulk",
            entity_type: "order",
            metadata: {
              total: results.length,
              dispatched,
              failed,
              skipped,
              courier_config_id: input.courierConfigId ?? null,
              pickup_location_id: input.pickupLocationId ?? null,
            },
          });
        } catch { /* ignored */ }
      })();
    }

    return NextResponse.json({
      data: results,
      summary: {
        total: results.length,
        dispatched,
        failed,
        skipped,
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
