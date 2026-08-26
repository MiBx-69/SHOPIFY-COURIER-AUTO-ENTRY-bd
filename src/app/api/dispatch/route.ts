import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { dispatchRequestSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { enforceRateLimit } from "@/lib/security/rate-limit";
export async function POST(request: NextRequest) { try { const { user, supabase } = await currentUser(); enforceRateLimit(`dispatch:${user.id}`, 20); const body = dispatchRequestSchema.parse(await request.json()); const { data: dispatch, error } = await supabase.rpc("claim_dispatch", { p_order_id: body.orderId, p_idempotency_key: body.idempotencyKey }); if (error || !dispatch) return NextResponse.json({ error: "The order cannot be dispatched." }, { status: 409 }); const result = await new DispatchService().execute(dispatch.id, body.courierConfigId); return NextResponse.json({ data: result.data }, { status: result.error ? 500 : 200 }); } catch (error) { return apiError(error); } }
