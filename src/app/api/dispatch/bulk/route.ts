import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { bulkDispatchSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";

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
      .select("id, organization_id")
      .in("organization_id", authorizedOrgIds);

    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));
    const shopOrgMap = new Map(
      (shops || []).map((s: { id: string; organization_id: string }) => [s.id, s.organization_id])
    );

    type OrderRecord = {
      id: string;
      name: string;
      shop_id: string;
      customer_phone: string | null;
      shipping_address: Record<string, unknown> | null;
      dispatch_status: string;
      cancelled_at: string | null;
      total_minor: number;
      currency: string;
    };

    // 2. Fetch the orders being dispatched
    const { data: orders } = await admin
      .from("orders")
      .select("id, name, shop_id, customer_phone, shipping_address, dispatch_status, cancelled_at, total_minor, currency")
      .in("id", input.orderIds);

    const orderMap = new Map(
      (((orders || []) as unknown) as OrderRecord[]).map((o) => [o.id, o])
    );
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
            input.courierConfigId,
            input.pickupLocationId,
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

    // 4. Re-query DB for authoritative dispatched count — never trust client-side totals
    const { count: dbDispatchedCount } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("id", input.orderIds)
      .eq("dispatch_status", "dispatched");

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
              db_confirmed_dispatched: dbDispatchedCount ?? dispatched,
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
        // DB-confirmed count is the authoritative source of truth
        dbConfirmedDispatched: dbDispatchedCount ?? dispatched,
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
