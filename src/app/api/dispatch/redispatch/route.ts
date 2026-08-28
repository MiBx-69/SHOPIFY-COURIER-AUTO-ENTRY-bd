import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { invalidateOrderCaches, redis } from "@/lib/redis";
import { resolveCourierForOrder, type ShippingRoutingRule, type CourierCandidateInfo } from "@/services/courier/routing";
import { PickupLocationService } from "@/services/courier/pickup-locations";
import { z } from "zod";

const redispatchSchema = z.object({
  orderId: z.string().uuid().optional(),
  orderIds: z.array(z.string().uuid()).min(1).max(250).optional(),
  courierConfigId: z.string().uuid().optional(),
  pickupLocationId: z.string().optional()
}).refine((data) => Boolean(data.orderId || (data.orderIds && data.orderIds.length > 0)), {
  message: "orderId or orderIds is required"
});

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    await enforceRateLimit(`redispatch:${user.id}`, 30);
    const body = redispatchSchema.parse(await request.json());
    const targetOrderIds = body.orderIds?.length ? body.orderIds : [body.orderId!];

    const admin = createAdminClient();

    // 1. Fetch orders
    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id, name, shop_id, customer_phone, shipping_address, shipping_lines, shipping_title, dispatch_status, is_skipped, cancelled_at, total_minor, currency")
      .in("id", targetOrderIds);

    if (ordersError || !orders || orders.length === 0) {
      return NextResponse.json({ error: "No orders found to redispatch" }, { status: 404 });
    }

    const shopIds = Array.from(new Set(orders.map((o) => o.shop_id)));

    // 2. Authorize user for shops
    for (const shopId of shopIds) {
      await requireShopPermission(shopId, "dispatch_orders");
    }

    // 3. Fetch shops config, shipping rules, and couriers
    const { data: shops } = await admin
      .from("shops")
      .select("id, organization_id, automatic_courier")
      .in("id", shopIds);

    const shopMap = new Map((shops || []).map((s) => [s.id, s]));

    const { data: configs } = await admin
      .from("courier_configs")
      .select("id, shop_id, priority, enabled, connection_status, couriers(provider,display_name)")
      .in("shop_id", shopIds);

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

    type RedispatchResultItem = {
      orderId: string;
      orderName: string;
      status: "dispatched" | "failed" | "skipped";
      trackingId?: string;
      courierReference?: string;
      courierName?: string;
      error?: string;
      message?: string;
    };

    const results: RedispatchResultItem[] = [];

    for (const order of orders) {
      if (order.cancelled_at) {
        results.push({
          orderId: order.id,
          orderName: order.name,
          status: "skipped",
          error: "Order is cancelled in Shopify"
        });
        continue;
      }

      if (!order.customer_phone || !order.shipping_address) {
        results.push({
          orderId: order.id,
          orderName: order.name,
          status: "failed",
          error: "Missing phone number or delivery address"
        });
        continue;
      }

      const shop = shopMap.get(order.shop_id);
      const candidates = configsByShop.get(order.shop_id) || [];
      const shippingRules = ((shop as any)?.shipping_rules || []) as ShippingRoutingRule[];

      let chosenConfigId = body.courierConfigId;
      let chosenPickupLocationId = body.pickupLocationId;

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
        results.push({
          orderId: order.id,
          orderName: order.name,
          status: "failed",
          error: "No enabled and connected courier service available"
        });
        continue;
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

      const idempotencyKey = crypto.randomUUID();

      // Claim redispatch lock (unskips order and resets dispatch status)
      const { data: claim, error: claimError } = await supabase.rpc("claim_redispatch", {
        p_order_id: order.id,
        p_idempotency_key: idempotencyKey
      });

      if (claimError || !claim) {
        const msg = claimError?.message || "Failed to acquire redispatch lock";
        results.push({
          orderId: order.id,
          orderName: order.name,
          status: "failed",
          error: msg
        });
        continue;
      }

      // Log redispatch event
      await admin.from("order_events").insert({
        shop_id: order.shop_id,
        order_id: order.id,
        event_type: "order_redispatched",
        payload: {
          redispatched_by: user.id,
          courier_config_id: chosenConfigId,
          pickup_location_id: chosenPickupLocationId,
          redispatched_at: new Date().toISOString()
        },
        occurred_at: new Date().toISOString()
      });

      try {
        const execution = await dispatchService.execute(
          claim.id,
          chosenConfigId,
          chosenPickupLocationId,
          user.id
        );

        if (!execution.success) {
          results.push({
            orderId: order.id,
            orderName: order.name,
            status: "failed",
            error: execution.error || "Courier rejected redispatch request"
          });
        } else {
          results.push({
            orderId: order.id,
            orderName: order.name,
            status: "dispatched",
            trackingId: execution.trackingId,
            courierReference: execution.courierReference,
            courierName: execution.courierName,
            message: `Redispatched via ${execution.courierName || "Courier"}`
          });
        }
      } catch (err: unknown) {
        results.push({
          orderId: order.id,
          orderName: order.name,
          status: "failed",
          error: err instanceof Error ? err.message : "Redispatch execution failed"
        });
      }
    }

    // Invalidate caches
    await invalidateOrderCaches(shopIds);

    // Audit log
    (async () => {
      try {
        const auditEntries = orders.map((order) => {
          const shop = shopMap.get(order.shop_id);
          const result = results.find((r) => r.orderId === order.id);
          return {
            organization_id: shop?.organization_id,
            shop_id: order.shop_id,
            actor_id: user.id,
            action: "dispatch.redispatch",
            entity_type: "order",
            entity_id: order.id,
            metadata: {
              status: result?.status,
              tracking_id: result?.trackingId,
              courier_name: result?.courierName,
              error: result?.error
            }
          };
        }).filter((a) => a.organization_id);

        if (auditEntries.length) {
          await admin.from("audit_logs").insert(auditEntries);
        }
      } catch (auditErr) {
        console.warn("Redispatch audit error:", auditErr);
      }
    })();

    const dispatchedCount = results.filter((r) => r.status === "dispatched").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    const isSingle = targetOrderIds.length === 1;
    const singleResult = results[0];

    if (isSingle) {
      if (singleResult.status === "dispatched") {
        return NextResponse.json({
          success: true,
          status: "dispatched",
          trackingId: singleResult.trackingId,
          courierReference: singleResult.courierReference,
          courierName: singleResult.courierName,
          message: singleResult.message || `Order ${singleResult.orderName} redispatched successfully!`
        });
      } else {
        return NextResponse.json({
          success: false,
          status: singleResult.status,
          error: singleResult.error || "Redispatch failed"
        }, { status: 422 });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: targetOrderIds.length,
        dispatched: dispatchedCount,
        failed: failedCount
      },
      results
    });
  } catch (error) {
    return apiError(error);
  }
}
