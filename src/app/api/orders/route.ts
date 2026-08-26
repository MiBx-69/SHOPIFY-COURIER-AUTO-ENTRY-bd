import { NextRequest, NextResponse } from "next/server";
import { currentUser, apiError } from "@/lib/api/auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) { try {
  const { user, supabase } = await currentUser(); enforceRateLimit(`orders:${user.id}`, 90);
  const p = request.nextUrl.searchParams; const shopId = p.get("shopId"); if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  const page = Math.max(0, Number(p.get("page") || 0)); const size = Math.min(100, Math.max(1, Number(p.get("size") || 30))); const status = p.get("dispatchStatus"); const search = p.get("q")?.trim();
  let query = supabase.from("orders").select("id,name,order_number,customer_name,customer_phone,total_minor,currency,financial_status,fulfillment_status,dispatch_status,shopify_updated_at,dispatches(tracking_id,courier_status,courier_configs(couriers(provider)))", { count: "exact" }).eq("shop_id", shopId).order("shopify_updated_at", { ascending: false }).range(page * size, page * size + size - 1);
  if (status) query = query.eq("dispatch_status", status); if (search) query = query.or(`name.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%`);
  const { data, count, error } = await query; if (error) throw error; return NextResponse.json({ data, count, page, size });
} catch (error) { return apiError(error); } }
