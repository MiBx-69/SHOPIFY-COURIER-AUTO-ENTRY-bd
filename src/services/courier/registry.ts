import { PathaoProvider, RedxProvider, SteadfastProvider } from "@/services/courier/providers";
import type { CourierProvider } from "@/services/courier/provider";
import type { CourierProviderName } from "@/types/domain";
const providers: Record<CourierProviderName, CourierProvider> = { redx: new RedxProvider(), pathao: new PathaoProvider(), steadfast: new SteadfastProvider() };
export const courierRegistry = { get: (name: CourierProviderName) => providers[name] };
