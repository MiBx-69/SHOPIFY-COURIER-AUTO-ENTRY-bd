import { NextResponse } from "next/server";

// ─── Error Categories ────────────────────────────────────────────────────────
export type ErrorCategory =
  | "AUTH_ERROR"
  | "DATABASE_ERROR"
  | "SHOPIFY_ERROR"
  | "WEBHOOK_ERROR"
  | "COURIER_ERROR"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PERMISSION_ERROR"
  | "SYNC_ERROR"
  | "DISPATCH_ERROR"
  | "UNKNOWN_ERROR";

// ─── Severity Levels ─────────────────────────────────────────────────────────
export type ErrorSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

// ─── Structured Error ─────────────────────────────────────────────────────────
export interface StructuredError {
  errorId: string;
  timestamp: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  service: string;
  operation?: string;
  httpStatus?: number;
  safeMessage: string;
  organizationId?: string;
  shopId?: string;
  userId?: string;
  orderId?: string;
  courier?: string;
  internalMessage?: string;
}

// ─── AppError — typed, user-safe application error ───────────────────────────
export class AppError extends Error {
  public readonly errorId: string;
  public readonly status: number;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly safeMessage: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    status: number,
    safeMessage: string,
    category: ErrorCategory = "UNKNOWN_ERROR",
    severity: ErrorSeverity = "ERROR",
    context?: Record<string, unknown>
  ) {
    super(safeMessage);
    this.errorId = createErrorId();
    this.status = status;
    this.category = category;
    this.severity = severity;
    this.safeMessage = safeMessage;
    this.context = context;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ─── Error ID Generator ───────────────────────────────────────────────────────
export function createErrorId(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ERR-${datePart}-${randPart}`;
}

// ─── Error Classifier ─────────────────────────────────────────────────────────
export function classifyError(error: unknown): {
  category: ErrorCategory;
  severity: ErrorSeverity;
  safeMessage: string;
  httpStatus: number;
} {
  if (error instanceof AppError) {
    return {
      category: error.category,
      severity: error.severity,
      safeMessage: error.safeMessage,
      httpStatus: error.status,
    };
  }

  const msg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));
  const msgLower = msg.toLowerCase();

  // Rate limit
  if (msgLower === "rate_limited" || msgLower.includes("rate limit")) {
    return { category: "RATE_LIMIT", severity: "WARN", safeMessage: "Too many requests. Please try again shortly.", httpStatus: 429 };
  }

  // Auth / permission
  if (msgLower.includes("authentication") || msgLower.includes("unauthorized") || msgLower.includes("unauthenticated")) {
    return { category: "AUTH_ERROR", severity: "WARN", safeMessage: "Authentication required.", httpStatus: 401 };
  }
  if (msgLower.includes("permission") || msgLower.includes("forbidden") || msgLower.includes("not permitted")) {
    return { category: "PERMISSION_ERROR", severity: "WARN", safeMessage: "You are not permitted to perform this action.", httpStatus: 403 };
  }

  // Courier-specific
  if (msgLower.includes("courier") || msgLower.includes("redx") || msgLower.includes("pathao") || msgLower.includes("steadfast")) {
    return { category: "COURIER_ERROR", severity: "ERROR", safeMessage: "A courier service error occurred. Please try again.", httpStatus: 502 };
  }

  // Dispatch
  if (msgLower.includes("dispatch")) {
    return { category: "DISPATCH_ERROR", severity: "ERROR", safeMessage: "Dispatch could not be completed. Please retry.", httpStatus: 422 };
  }

  // Shopify
  if (msgLower.includes("shopify")) {
    return { category: "SHOPIFY_ERROR", severity: "ERROR", safeMessage: "A Shopify API error occurred.", httpStatus: 502 };
  }

  // Database
  if (msgLower.includes("database") || msgLower.includes("postgres") || msgLower.includes("supabase") || msgLower.includes("pgrst")) {
    return { category: "DATABASE_ERROR", severity: "CRITICAL", safeMessage: "A database error occurred. Our team has been alerted.", httpStatus: 500 };
  }

  // Timeout / network
  if (msgLower.includes("timeout") || msgLower.includes("abort") || msgLower.includes("etimedout")) {
    return { category: "TIMEOUT", severity: "ERROR", safeMessage: "The request timed out. Please try again.", httpStatus: 504 };
  }

  // Validation
  if (msgLower.includes("validation") || msgLower.includes("invalid") || msgLower.includes("zod") || msgLower.includes("parse")) {
    return { category: "VALIDATION_ERROR", severity: "WARN", safeMessage: "Invalid request data. Please check your input.", httpStatus: 400 };
  }

  // Sync
  if (msgLower.includes("sync") || msgLower.includes("reconcil")) {
    return { category: "SYNC_ERROR", severity: "ERROR", safeMessage: "Synchronization error. Please try syncing again.", httpStatus: 500 };
  }

  return {
    category: "UNKNOWN_ERROR",
    severity: "ERROR",
    safeMessage: "Something went wrong. Please try again.",
    httpStatus: 500,
  };
}

// ─── Structured Logger ────────────────────────────────────────────────────────
export function logStructured(structured: StructuredError): void {
  const { severity, internalMessage, ...safe } = structured;

  // Redact any secrets that might have slipped through
  const sanitized = {
    ...safe,
    // Never log sensitive fields
    token: undefined,
    apiKey: undefined,
    password: undefined,
    secret: undefined,
    internalMessage,
  };

  const logEntry = JSON.stringify({ ...sanitized, severity, level: severity });

  switch (severity) {
    case "CRITICAL":
    case "ERROR":
      console.error(logEntry);
      break;
    case "WARN":
      console.warn(logEntry);
      break;
    case "DEBUG":
      if (process.env.NODE_ENV !== "production") console.debug(logEntry);
      break;
    default:
      console.info(logEntry);
  }
}

// ─── API Error Handler (for use in route handlers) ────────────────────────────
export function buildApiError(
  error: unknown,
  context?: {
    service?: string;
    operation?: string;
    shopId?: string;
    userId?: string;
    orderId?: string;
    courier?: string;
  }
): NextResponse {
  const errorId = error instanceof AppError ? error.errorId : createErrorId();
  const { category, severity, safeMessage, httpStatus } = classifyError(error);

  const structured: StructuredError = {
    errorId,
    timestamp: new Date().toISOString(),
    severity,
    category,
    service: context?.service ?? "api",
    operation: context?.operation,
    httpStatus,
    safeMessage,
    shopId: context?.shopId,
    userId: context?.userId,
    orderId: context?.orderId,
    courier: context?.courier,
    internalMessage: error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error)),
  };

  logStructured(structured);

  // Trigger Telegram alert for CRITICAL/ERROR severity (async, non-blocking)
  if (severity === "CRITICAL" || severity === "ERROR") {
    // Dynamically imported to avoid bundling in cold paths
    import("@/lib/notifications/telegram")
      .then(({ telegramNotifier }) => telegramNotifier.sendAlert(structured))
      .catch(() => {
        // Telegram failure must never crash the main error handler
      });
  }

  return NextResponse.json(
    {
      success: false,
      error: safeMessage,
      errorId,
      category,
    },
    { status: httpStatus }
  );
}
