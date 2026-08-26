import { z } from "zod";
export const dispatchRequestSchema = z.object({ orderId: z.string().uuid(), idempotencyKey: z.string().uuid(), courierConfigId: z.string().uuid().optional() });
export const bulkDispatchSchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(100), courierConfigId: z.string().uuid().optional() });
export const courierConfigSchema = z.object({ courierId: z.string().uuid(), enabled: z.boolean(), priority: z.number().int().min(1).max(100), credentials: z.record(z.string().min(1)).optional() });
export const inviteSchema = z.object({ email: z.string().email(), role: z.enum(['admin','manager','dispatcher','viewer']) });
