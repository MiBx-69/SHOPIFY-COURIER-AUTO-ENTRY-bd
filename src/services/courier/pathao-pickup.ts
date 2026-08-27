import { courierFetch, requireFields, type CourierCredentials } from "@/services/courier/provider";
import type { PickupLocation } from "@/types/domain";

const PRODUCTION_BASE_URL = "https://api-hermes.pathao.com";
const SANDBOX_BASE_URL = "https://courier-api-sandbox.pathao.com";
const MAX_PAGES = 50;

type JsonObject = Record<string, unknown>;

type PathaoStore = {
  store_id?: number | string;
  id?: number | string;
  store_name?: string;
  name?: string;
  store_address?: string;
  address?: string;
  store_phone?: string;
  contact_number?: string;
  phone?: string;
  is_active?: boolean | number | string;
  city_id?: number | string;
  zone_id?: number | string;
  area_id?: number | string;
  city_name?: string;
  zone_name?: string;
  area_name?: string;
  is_default_store?: boolean;
  is_default_return_store?: boolean;
};

function baseUrl(credentials: CourierCredentials): string {
  return (credentials.environment || "").toLowerCase() === "sandbox"
    ? SANDBOX_BASE_URL
    : PRODUCTION_BASE_URL;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(asObject(item)))
    : [];
}

function positiveId(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? text : null;
}

function extractStorePage(payload: unknown): {
  stores: PathaoStore[];
  currentPage?: number;
  lastPage?: number;
} {
  const root = asObject(payload);
  if (!root) return { stores: [] };

  const rootData = root.data;
  const dataObject = asObject(rootData);

  // Pathao's normal response:
  // { data: { data: [...], current_page, last_page, ... } }
  const nestedStores = dataObject ? asArray(dataObject.data) : [];
  if (nestedStores.length > 0 && dataObject) {
    return {
      stores: nestedStores as PathaoStore[],
      currentPage: Number(dataObject.current_page) || undefined,
      lastPage: Number(dataObject.last_page) || undefined
    };
  }

  // Be tolerant of older/alternate responses:
  // { data: [...] }
  const directStores = asArray(rootData);
  if (directStores.length > 0) {
    return { stores: directStores as PathaoStore[] };
  }

  // Some responses wrap the pagination object one level deeper.
  const nestedData = dataObject?.data;
  const nestedObject = asObject(nestedData);
  if (nestedObject) {
    const stores = asArray(nestedObject.data);
    if (stores.length > 0) {
      return {
        stores: stores as PathaoStore[],
        currentPage: Number(nestedObject.current_page) || undefined,
        lastPage: Number(nestedObject.last_page) || undefined
      };
    }
  }

  return { stores: [] };
}

function mapStore(store: PathaoStore): PickupLocation | null {
  const providerId = positiveId(store.store_id ?? store.id);
  if (!providerId) return null;

  const activeRaw = store.is_active;
  const isActive = activeRaw === undefined
    ? true
    : activeRaw === true || activeRaw === 1 || activeRaw === "1" || String(activeRaw).toLowerCase() === "true";

  return {
    id: providerId,
    courierLocationId: providerId,
    name: String(store.store_name ?? store.name ?? `Pathao Store #${providerId}`).trim(),
    address: String(store.store_address ?? store.address ?? "").trim(),
    phone: String(store.store_phone ?? store.contact_number ?? store.phone ?? "").trim() || undefined,
    city: String(store.city_name ?? "").trim() || undefined,
    area: String(store.area_name ?? store.zone_name ?? "").trim() || undefined,
    isActive
  };
}

async function issueToken(credentials: CourierCredentials): Promise<string> {
  requireFields(credentials, ["clientId", "clientSecret", "username", "password"]);

  const { response, data } = await courierFetch(`${baseUrl(credentials)}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
      grant_type: "password"
    })
  });

  const body = asObject(data);
  const token = typeof body?.access_token === "string" ? body.access_token : "";
  if (!response.ok || !token) {
    const message = typeof body?.message === "string" ? body.message : "Unable to authenticate with Pathao.";
    throw new Error(message);
  }

  return token;
}

/**
 * Fetch the merchant's real Pathao stores from Pathao's API.
 * No configured storeId, first store, or synthetic fallback is used.
 */
export async function fetchPathaoPickupLocations(credentials: CourierCredentials): Promise<PickupLocation[]> {
  const token = await issueToken(credentials);
  const stores: PickupLocation[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${baseUrl(credentials)}/aladdin/api/v1/stores?page=${page}`;
    const { response, data } = await courierFetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const body = asObject(data);
      const message = typeof body?.message === "string"
        ? body.message
        : `Pathao store API returned HTTP ${response.status}.`;
      throw new Error(message);
    }

    const pageData = extractStorePage(data);
    for (const rawStore of pageData.stores) {
      const location = mapStore(rawStore);
      if (!location || seen.has(location.courierLocationId)) continue;
      seen.add(location.courierLocationId);
      stores.push(location);
    }

    const currentPage = pageData.currentPage ?? page;
    const lastPage = pageData.lastPage;

    if (lastPage !== undefined && currentPage >= lastPage) break;
    if (pageData.stores.length === 0) break;

    // If pagination metadata is absent, stop after the first non-empty page
    // only when the API gives fewer than a normal page. Otherwise continue.
    if (lastPage === undefined && pageData.stores.length < 100) break;
  }

  if (stores.length === 0) {
    throw new Error("Pathao authenticated successfully, but no pickup stores were returned by the Pathao store API.");
  }

  return stores;
}
