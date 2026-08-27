import { PathaoProvider, RedxProvider, SteadfastProvider } from "@/services/courier/providers";
import { fetchPathaoPickupLocations } from "@/services/courier/pathao-pickup";
import type { CourierProvider, CourierCredentials } from "@/services/courier/provider";
import type { CourierProviderName, PickupLocation } from "@/types/domain";

class PathaoProviderWithLivePickupStores extends PathaoProvider {
  override async getPickupLocations(credentials: CourierCredentials): Promise<PickupLocation[]> {
    return fetchPathaoPickupLocations(credentials);
  }
}

const providers: Record<CourierProviderName, CourierProvider> = {
  redx: new RedxProvider(),
  pathao: new PathaoProviderWithLivePickupStores(),
  steadfast: new SteadfastProvider()
};

export const courierRegistry = {
  get: (name: CourierProviderName) => providers[name]
};
