import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { bulkDispatchSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";
export async function POST(request: NextRequest) { try { const { supabase } = await currentUser(); const input = bulkDispatchSchema.parse(await request.json()); const results = await Promise.all(input.orderIds.map(async (orderId) => { const key = crypto.randomUUID(); const { data, error } = await supabase.rpc("claim_dispatch", { p_order_id: orderId, p_idempotency_key: key }); if (error || !data) return { orderId, status: "skipped" }; const execution = await new DispatchService().execute(data.id, input.courierConfigId); return { orderId, status: execution.error ? "failed" : "dispatched", dispatch: execution.data }; })); return NextResponse.json({ data: results }); } catch (error) { return apiError(error); } }
