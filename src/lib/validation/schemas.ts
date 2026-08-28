import { z } from "zod";

export const dispatchRequestSchema = z.object({
  orderId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  courierConfigId: z.string().uuid().optional(),
  pickupLocationId: z.coerce.string().optional()
});

export const bulkDispatchSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(250),
  courierConfigId: z.string().uuid().optional(),
  pickupLocationId: z.coerce.string().optional()
});

export const courierConfigSchema = z.object({
  courierId: z.string().uuid(),
  enabled: z.boolean(),
  priority: z.number().int().min(1).max(100),
  credentials: z.record(z.string().min(1)).optional()
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "dispatcher", "viewer"]),
  name: z.string().optional(),
  phone: z.string().optional(),
  company_name: z.string().optional(),
  organization_id: z.string().uuid()
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(200).default(50),
});

export const searchSchema = z.object({
  q: z.string().max(200).optional(),
});

// Bangladesh mobile phone: 11 digits, starts with 01[3-9]
export const bdPhoneSchema = z
  .string()
  .regex(/^01[3-9]\d{8}$/, "Invalid Bangladesh phone number (must be 11 digits starting with 01)");

export const shopIdSchema = z.string().uuid("shopId must be a valid UUID");

export const changeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "manager", "dispatcher", "viewer"])
});

export const removeMemberSchema = z.object({
  userId: z.string().uuid(),
});
