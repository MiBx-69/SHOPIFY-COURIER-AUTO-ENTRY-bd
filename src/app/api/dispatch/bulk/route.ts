import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { bulkDispatchSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";

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
      .select("id")
      .in("organization_id", authorizedOrgIds);

    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));

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

    const orderMap = new Map((((orders || []) as unknown) as OrderRecord[]).map((o) => [o.id, o]));
    const dispatchService = new DispatchService();

    // 3. Process each order safely with independent error containment
    const results = await Promise.all(
      input.orderIds.map(async (orderId) => {
        const order = orderMap.get(orderId);

        // Security check: order must exist and belong to an authorized shop
        if (!order || !authorizedShopIds.has(order.shop_id)) {
          return {
            orderId,
            orderName: order?.name || "Order",
            status: "failed" as const,
            reason: "Order not found or unauthorized"
          };
        }

        // Check if cancelled
        if (order.cancelled_at) {
          return {
            orderId,
            orderName: order.name,
            status: "skipped" as const,
            reason: "Order is cancelled in Shopify"
          };
        }

        // Check if already dispatched
        if (order.dispatch_status === "dispatched") {
          return {
            orderId,
            orderName: order.name,
            status: "skipped" as const,
            reason: "Already dispatched"
          };
        }

        // Validate essential delivery details
        if (!order.customer_phone || !order.shipping_address) {
          return {
            orderId,
            orderName: order.name,
            status: "failed" as const,
            reason: "Missing phone number or delivery address"
          };
        }

        // Claim dispatch lock idempotently via Supabase RPC
        const idempotencyKey = crypto.randomUUID();
        const { data: claim, error: claimError } = await supabase.rpc("claim_dispatch", {
          p_order_id: orderId,
          p_idempotency_key: idempotencyKey
        });

        if (claimError || !claim) {
          return {
            orderId,
            orderName: order.name,
            status: "skipped" as const,
            reason: "Dispatch already in progress or already processed"
          };
        }

        // Execute courier dispatch with pickup location
        try {
          const execution = await dispatchService.execute(
            claim.id,
            input.courierConfigId,
            input.pickupLocationId,
            user.id
          );

          if (!execution.success) {
            return {
              orderId,
              orderName: order.name,
              status: "failed" as const,
              reason: execution.error || "Courier rejected shipment creation"
            };
          }

          return {
            orderId,
            orderName: order.name,
            status: "dispatched" as const,
            trackingId: execution.trackingId,
            courierName: execution.courierName
          };
        } catch (execErr) {
          return {
            orderId,
            orderName: order.name,
            status: "failed" as const,
            reason: execErr instanceof Error ? execErr.message : "Dispatch execution failed"
          };
        }
      })
    );

    const dispatched = results.filter((r) => r.status === "dispatched").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      data: results,
      summary: {
        total: results.length,
        dispatched,
        failed,
        skipped
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
