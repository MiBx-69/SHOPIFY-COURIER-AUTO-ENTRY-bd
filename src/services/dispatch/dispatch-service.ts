import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";
import { selectCourier } from "@/services/courier/selector";
import { PickupLocationService } from "@/services/courier/pickup-locations";
import { normalizeBdPhone, normalizeDeliveryAddress } from "@/services/courier/providers";
import { updateShopifyDispatchMetafields, createShopifyFulfillment } from "@/services/shopify/client";
import type { NormalizedShipment } from "@/types/domain";

export type DispatchExecutionResult = {
  success: boolean;
  status: "dispatched" | "failed" | "unknown";
  trackingId?: string;
  courierReference?: string;
  courierName?: string;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export class DispatchService {
  async execute(
    dispatchId: string, 
    requestedConfigId?: string, 
    requestedPickupLocationId?: string, 
    actorId?: string
  ): Promise<DispatchExecutionResult> {
    const admin = createAdminClient();
    const { data: dispatch, error } = await admin
      .from("dispatches")
      .select("*,orders(*,order_line_items(*))")
      .eq("id", dispatchId)
      .single();

    if (error || !dispatch) {
      throw new Error("Dispatch claim not found");
    }

    try {
      const order = dispatch.orders as Record<string, unknown>;

      // Idempotency: if already dispatched, return existing tracking without creating duplicates
      if (dispatch.status === "dispatched" && dispatch.tracking_id) {
        return {
          success: true,
          status: "dispatched",
          trackingId: dispatch.tracking_id,
          courierReference: dispatch.courier_reference,
          message: "Order is already dispatched.",
          data: dispatch
        };
      }

      if (order.cancelled_at) {
        return this.fail(dispatch, "Order is cancelled in Shopify and cannot be dispatched");
      }

      if (!order.customer_phone || !order.shipping_address) {
        return this.fail(dispatch, "Order is missing customer phone or shipping address");
      }

      const { data: configs } = await admin
        .from("courier_configs")
        .select("id,priority,enabled,connection_status,couriers(provider,display_name)")
        .eq("shop_id", dispatch.shop_id);

      const candidates = (configs || []).map((item) => ({
        ...item,
        provider: (item.couriers as unknown as { provider: "redx" | "pathao" | "steadfast"; display_name?: string }).provider,
        display_name: (item.couriers as unknown as { display_name?: string }).display_name
      }));

      if (!candidates || candidates.length === 0) {
        return this.fail(dispatch, "No enabled courier is configured for this store. Please configure couriers in Settings.");
      }

      let selected;
      try {
        selected = selectCourier(candidates, requestedConfigId);
      } catch (selErr) {
        return this.fail(dispatch, selErr instanceof Error ? selErr.message : "No eligible courier available");
      }

      const selectedMeta = candidates.find((c) => c.id === selected.id);
      const courierDisplayName = selectedMeta?.display_name || selected.provider.toUpperCase();

      // Fetch pickup locations for selected courier
      const locationsData = await PickupLocationService.get(
        selected.id, 
        dispatch.shop_id, 
        actorId || dispatch.created_by || "system"
      );
      const availableLocations = locationsData.locations || [];

      if (availableLocations.length === 0) {
        return this.fail(dispatch, `No pickup location is configured for ${courierDisplayName}. Please configure pickup locations in Settings.`);
      }

      // Resolve location
      let chosenLocation = availableLocations.find(
        (l) => l.id === requestedPickupLocationId || l.courierLocationId === requestedPickupLocationId
      );
      if (!chosenLocation) {
        chosenLocation = availableLocations.find((l) => l.id === locationsData.defaultLocationId || l.isDefault) || availableLocations[0];
      }

      const { data: secret, error: secretError } = await admin
        .from("courier_secrets")
        .select("ciphertext,iv,auth_tag")
        .eq("courier_config_id", selected.id)
        .single();

      if (secretError || !secret) {
        return this.fail(dispatch, `Courier credentials for ${courierDisplayName} are unavailable or missing.`);
      }

      const credentials = decryptSecret({ ciphertext: secret.ciphertext, iv: secret.iv, authTag: secret.auth_tag });
      const items = (order.order_line_items || []) as Array<Record<string, unknown>>;

      const normalizedPhone = normalizeBdPhone(String(order.customer_phone || ""));
      if (!normalizedPhone || normalizedPhone.length < 11) {
        return this.fail(dispatch, `Customer phone (${order.customer_phone || "none"}) is invalid. Courier requires an 11-digit mobile number.`);
      }

      const shippingAddr = (order.shipping_address || {}) as Record<string, string>;
      const formattedAddress = normalizeDeliveryAddress(shippingAddr);

      const isPrepaid = String(order.financial_status || "").toLowerCase() === "paid";
      const codAmount = isPrepaid ? 0 : Math.max(0, Math.round(Number(order.total_minor || 0) / 100));

      const orderNumberStr = String(
        order.order_number && Number(order.order_number) > 0
          ? order.order_number
          : (order.name || order.id)
      ).replace(/[^a-zA-Z0-9_-]/g, "") || String(order.name || order.id);

      const payload: NormalizedShipment = {
        orderId: String(order.id),
        orderNumber: orderNumberStr,
        customerName: String(order.customer_name || "Customer"),
        phone: normalizedPhone,
        email: order.customer_email ? String(order.customer_email) : undefined,
        fullAddress: formattedAddress,
        city: shippingAddr.city || "Dhaka",
        area: shippingAddr.area || shippingAddr.province || undefined,
        postalCode: shippingAddr.zip || undefined,
        codAmount: codAmount,
        notes: order.note ? String(order.note) : undefined,
        pickupLocationId: chosenLocation.courierLocationId || chosenLocation.id,
        pickupLocationName: chosenLocation.name,
        pickupAddress: chosenLocation.address,
        pickupPhone: chosenLocation.phone,
        items: items.map((item) => ({
          productName: String(item.title || "Product"),
          variant: item.variant_title ? String(item.variant_title) : undefined,
          sku: item.sku ? String(item.sku) : undefined,
          quantity: Math.max(1, Number(item.quantity) || 1),
          price: Number(item.unit_price_minor || 0) / 100
        }))
      };

      const provider = courierRegistry.get(selected.provider);
      const attempt = await admin.from("dispatch_attempts").insert({
        dispatch_id: dispatch.id,
        shop_id: dispatch.shop_id,
        provider: selected.provider,
        idempotency_key: dispatch.idempotency_key,
        status: "started",
        request_metadata: {
          pickup_location_id: chosenLocation.id,
          pickup_location_name: chosenLocation.name,
          pickup_address: chosenLocation.address,
          pickup_phone: chosenLocation.phone
        }
      }).select().single();

      // Log structured dispatch execution start
      console.info(`[DISPATCH START] dispatch_id=${dispatch.id} order_id=${dispatch.order_id} courier=${selected.provider} pickup_location="${chosenLocation.name}"`);

      const result = await provider.createShipment(payload, credentials, dispatch.idempotency_key);

      if (result.outcome !== "success") {
        await admin.from("dispatch_attempts").update({
          status: result.outcome,
          completed_at: new Date().toISOString(),
          error_code: result.code,
          safe_error_message: result.message,
          response_metadata: result.metadata || {}
        }).eq("id", attempt.data?.id);

        if (result.outcome === "unknown") {
          const { data: unknownDispatch } = await admin
            .from("dispatches")
            .update({ 
              phase: "unknown", 
              safe_error_message: "Courier outcome is unknown; reconcile before retrying.",
              updated_at: new Date().toISOString()
            })
            .eq("id", dispatch.id)
            .select()
            .single();

          return {
            success: false,
            status: "unknown",
            error: "Courier outcome is unknown; reconcile before retrying.",
            data: unknownDispatch as Record<string, unknown>
          };
        }

        return this.fail(dispatch, result.message || "Courier rejected shipment creation");
      }

      console.info(`[DISPATCH SUCCESS] dispatch_id=${dispatch.id} order_id=${dispatch.order_id} tracking_id=${result.trackingId} courier=${selected.provider}`);

      await admin.from("dispatch_attempts").update({
        status: "success",
        completed_at: new Date().toISOString(),
        external_reference: result.courierReference,
        response_metadata: result.metadata || {}
      }).eq("id", attempt.data?.id);

      await admin.from("courier_shipments").insert({
        dispatch_id: dispatch.id,
        shop_id: dispatch.shop_id,
        provider: selected.provider,
        tracking_id: result.trackingId,
        courier_reference: result.courierReference,
        status: "created"
      });

      await admin.from("dispatches").update({
        courier_config_id: selected.id,
        status: "dispatched",
        phase: "courier_created",
        tracking_id: result.trackingId,
        courier_reference: result.courierReference,
        courier_status: "created",
        safe_error_message: null,
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", dispatch.id);

      await admin.from("orders").update({ 
        dispatch_status: "dispatched",
        updated_at: new Date().toISOString()
      }).eq("id", dispatch.order_id);

      // Record permanent order event with pickup location details
      await admin.from("order_events").insert({
        shop_id: dispatch.shop_id,
        order_id: dispatch.order_id,
        event_type: "order_dispatched",
        payload: {
          provider: selected.provider,
          tracking_id: result.trackingId,
          courier_reference: result.courierReference,
          pickup_location_id: chosenLocation.id,
          pickup_location_name: chosenLocation.name,
          pickup_address: chosenLocation.address,
          pickup_phone: chosenLocation.phone,
          dispatched_at: new Date().toISOString()
        }
      });

      try { 
        await updateShopifyDispatchMetafields(dispatch.shop_id, String(order.shopify_order_gid), {
          courier: selected.provider,
          trackingId: result.trackingId,
          reference: result.courierReference,
          dispatchedAt: new Date().toISOString()
        }); 
        await createShopifyFulfillment(dispatch.shop_id, String(order.shopify_order_gid), {
          company: selected.provider,
          number: result.trackingId
        });
        await admin.from("dispatches").update({ 
          phase: "completed", 
          shopify_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", dispatch.id); 
      } catch { 
        await admin.from("dispatches").update({ 
          phase: "shopify_update_pending", 
          safe_error_message: "Courier shipment created; Shopify update requires attention.",
          updated_at: new Date().toISOString()
        }).eq("id", dispatch.id); 
      }

      const { data: finalDispatch } = await admin.from("dispatches").select().eq("id", dispatch.id).single();

      return {
        success: true,
        status: "dispatched",
        trackingId: result.trackingId,
        courierReference: result.courierReference,
        courierName: courierDisplayName,
        data: finalDispatch as Record<string, unknown>
      };
    } catch (unhandledErr) {
      const errMsg = unhandledErr instanceof Error ? unhandledErr.message : "Unexpected error during dispatch";
      return this.fail(dispatch, errMsg);
    }
  }

  async cancel(orderIdOrDispatchId: string, actorId?: string, reason?: string) {
    const admin = createAdminClient();
    const { data: dispatch } = await admin
      .from("dispatches")
      .select("*,courier_configs(id,couriers(provider)),courier_shipments(*)")
      .or(`id.eq.${orderIdOrDispatchId},order_id.eq.${orderIdOrDispatchId}`)
      .maybeSingle();

    if (!dispatch) {
      const { data: order } = await admin.from("orders").select("id, shop_id, dispatch_status").eq("id", orderIdOrDispatchId).maybeSingle();
      if (!order) throw new Error("Order not found");
      await admin.from("orders").update({ dispatch_status: "cancelled", updated_at: new Date().toISOString() }).eq("id", order.id);
      await admin.from("order_events").insert({
        shop_id: order.shop_id,
        order_id: order.id,
        event_type: "dispatch_cancelled",
        payload: { reason: reason || "Dispatch cancelled", actor_id: actorId, cancelled_at: new Date().toISOString() }
      });
      return { success: true, message: "Dispatch cancelled" };
    }

    const shipments = dispatch.courier_shipments as Array<Record<string, unknown>> | null;
    const shipment = shipments?.[0];
    const trackingId = dispatch.tracking_id || (shipment?.tracking_id as string);
    const courierConfig = dispatch.courier_configs as unknown as { id: string; couriers?: { provider: "redx"|"pathao"|"steadfast" } } | null;

    if (trackingId && courierConfig?.couriers?.provider) {
      const providerName = courierConfig.couriers.provider;
      const provider = courierRegistry.get(providerName);

      if (!provider.cancelShipment) {
        throw new Error(`Courier cancellation is not supported for ${providerName.toUpperCase()} shipments.`);
      }

      const { data: secret } = await admin
        .from("courier_secrets")
        .select("ciphertext,iv,auth_tag")
        .eq("courier_config_id", courierConfig.id)
        .single();

      if (!secret) {
        throw new Error("Courier credentials not found to cancel shipment");
      }

      const credentials = decryptSecret({ ciphertext: secret.ciphertext, iv: secret.iv, authTag: secret.auth_tag });
      await provider.cancelShipment(trackingId, credentials);

      if (shipment?.id) {
        await admin.from("courier_shipments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", shipment.id as string);
        await admin.from("courier_tracking_events").insert({
          shipment_id: shipment.id as string,
          shop_id: dispatch.shop_id,
          status: "cancelled",
          message: "Shipment cancelled by user request",
          occurred_at: new Date().toISOString()
        });
      }
    }

    await admin.from("dispatches").update({
      status: "cancelled",
      courier_status: "cancelled",
      safe_error_message: reason ? `Cancelled: ${reason}` : "Dispatch cancelled",
      updated_at: new Date().toISOString()
    }).eq("id", dispatch.id);

    await admin.from("orders").update({ dispatch_status: "cancelled", updated_at: new Date().toISOString() }).eq("id", dispatch.order_id);

    await admin.from("order_events").insert({
      shop_id: dispatch.shop_id,
      order_id: dispatch.order_id,
      event_type: "dispatch_cancelled",
      payload: { reason: reason || "Dispatch cancelled", actor_id: actorId, cancelled_at: new Date().toISOString() }
    });

    return { success: true, message: "Dispatch cancelled successfully" };
  }

  private async fail(dispatch: { id: string; order_id: string }, message: string): Promise<DispatchExecutionResult> {
    const admin = createAdminClient();
    console.error(`[DISPATCH FAILED] dispatch_id=${dispatch.id} order_id=${dispatch.order_id} error="${message}"`);
    await admin.from("dispatches").update({ 
      status: "failed", 
      phase: "failed", 
      safe_error_message: message,
      updated_at: new Date().toISOString()
    }).eq("id", dispatch.id);
    await admin.from("orders").update({ 
      dispatch_status: "failed",
      updated_at: new Date().toISOString()
    }).eq("id", dispatch.order_id);
    const { data } = await admin.from("dispatches").select().eq("id", dispatch.id).single();
    return {
      success: false,
      status: "failed",
      error: message,
      data: data as Record<string, unknown>
    };
  }
}
