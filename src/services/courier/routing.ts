export type ShippingZone = "inside_dhaka" | "outside_dhaka" | "unknown";

export type ShippingRoutingRule = {
  id: string;
  name: string; // e.g. "Inside Dhaka", "Outside Dhaka", "Express Rate"
  zoneType: "inside_dhaka" | "outside_dhaka" | "custom_method" | "custom_city";
  methodPattern?: string; // regex or keyword matching shippingLine title / code, e.g. "Inside Dhaka", "Inside", "Redx"
  cityPattern?: string; // keywords matching city or district
  courierConfigId: string; // Target courier_configs.id
  courierProvider?: "redx" | "pathao" | "steadfast";
  pickupLocationId?: string; // Target pickup location ID
  enabled: boolean;
  priority: number;
};

export type RedispatchSettings = {
  auto_restore: boolean;
  use_shipping_rules: boolean;
  one_click_instant: boolean;
};

export const DEFAULT_REDISPATCH_SETTINGS: RedispatchSettings = {
  auto_restore: true,
  use_shipping_rules: true,
  one_click_instant: true
};

const DHAKA_KEYWORDS = [
  "dhaka",
  "dacca",
  "mirpur",
  "gulshan",
  "uttara",
  "banani",
  "dhanmondi",
  "mohammadpur",
  "motijheel",
  "badda",
  "khilgaon",
  "rampura",
  "malibagh",
  "baridhara",
  "bashundhara",
  "lalbagh",
  "jatrabari",
  "shahbagh",
  "tejgaon",
  "mohakhali",
  "keraniganj",
  "savar",
  "ashulia",
  "demra"
];

/**
 * Detects whether an order is Inside Dhaka or Outside Dhaka based on shipping address and shipping title.
 */
export function detectShippingZone(
  shippingAddress: Record<string, unknown> | null | undefined,
  shippingTitle?: string | null
): {
  zone: ShippingZone;
  label: string;
  cityOrArea: string;
} {
  const addr = (shippingAddress || {}) as Record<string, string>;
  const city = (addr.city || "").trim();
  const province = (addr.province || "").trim();
  const area = (addr.area || "").trim();
  const address1 = (addr.address1 || "").trim();
  const address2 = (addr.address2 || "").trim();
  const title = (shippingTitle || "").trim().toLowerCase();

  const combinedAddress = `${city} ${province} ${area} ${address1} ${address2}`.toLowerCase();

  // 1. Explicit shipping title takes precedence if it specifically states Inside/Outside Dhaka
  if (title.includes("outside") || title.includes("বাহিরে") || title.includes("out of dhaka")) {
    return {
      zone: "outside_dhaka",
      label: "Outside Dhaka",
      cityOrArea: city || province || "Outside Dhaka"
    };
  }

  if (title.includes("inside") || title.includes("ভিতরে") || title.includes("within dhaka") || title.includes("in dhaka")) {
    return {
      zone: "inside_dhaka",
      label: "Inside Dhaka",
      cityOrArea: city || "Dhaka"
    };
  }

  // 2. Check address keywords
  const isDhakaAddress = DHAKA_KEYWORDS.some((kw) => combinedAddress.includes(kw));

  if (isDhakaAddress) {
    const displayArea = area || (city.toLowerCase().includes("dhaka") ? "Dhaka" : city) || "Dhaka";
    return {
      zone: "inside_dhaka",
      label: "Inside Dhaka",
      cityOrArea: displayArea
    };
  }

  if (city || province) {
    return {
      zone: "outside_dhaka",
      label: "Outside Dhaka",
      cityOrArea: city || province || "Outside Dhaka"
    };
  }

  return {
    zone: "unknown",
    label: "Unknown Zone",
    cityOrArea: "Standard Delivery"
  };
}

export type CourierCandidateInfo = {
  id: string;
  provider: "redx" | "pathao" | "steadfast";
  displayName: string;
  enabled: boolean;
  priority: number;
  connectionStatus: string;
};

export type ResolvedRouting = {
  courierConfigId: string;
  courierName: string;
  provider: "redx" | "pathao" | "steadfast";
  pickupLocationId?: string;
  zone: ShippingZone;
  zoneLabel: string;
  destinationSummary: string;
  matchedRuleName?: string;
};

/**
 * Evaluates shipping routing rules for a given order and returns the best matching courier configuration.
 */
export function resolveCourierForOrder(
  order: {
    shipping_address?: Record<string, unknown> | null;
    shipping_title?: string | null;
    shipping_lines?: Array<{ title?: string }> | null;
  },
  rules: ShippingRoutingRule[] | undefined | null,
  availableCandidates: CourierCandidateInfo[],
  pickupLocationsMap?: Record<string, { locations?: Array<{ id: string; courierLocationId?: string; isDefault?: boolean }>; defaultLocationId?: string }>
): ResolvedRouting | null {
  const activeCandidates = availableCandidates.filter((c) => c.enabled && c.connectionStatus === "connected");
  if (!activeCandidates.length) return null;

  const candidateMap = new Map(activeCandidates.map((c) => [c.id, c]));

  // Get shipping title from order.shipping_title or order.shipping_lines[0].title
  const shippingTitle = order.shipping_title || order.shipping_lines?.[0]?.title || "";
  const { zone, label: zoneLabel, cityOrArea } = detectShippingZone(order.shipping_address, shippingTitle);

  const destinationSummary = `${zoneLabel} (${cityOrArea})`;

  const enabledRules = (rules || [])
    .filter((r) => r.enabled && candidateMap.has(r.courierConfigId))
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  let matchedRule: ShippingRoutingRule | null = null;

  for (const rule of enabledRules) {
    if (rule.zoneType === "inside_dhaka" && zone === "inside_dhaka") {
      matchedRule = rule;
      break;
    }
    if (rule.zoneType === "outside_dhaka" && zone === "outside_dhaka") {
      matchedRule = rule;
      break;
    }
    if (rule.zoneType === "custom_method" && rule.methodPattern && shippingTitle) {
      if (shippingTitle.toLowerCase().includes(rule.methodPattern.toLowerCase())) {
        matchedRule = rule;
        break;
      }
    }
    if (rule.zoneType === "custom_city" && rule.cityPattern) {
      const addrStr = JSON.stringify(order.shipping_address || "").toLowerCase();
      if (addrStr.includes(rule.cityPattern.toLowerCase())) {
        matchedRule = rule;
        break;
      }
    }
  }

  const chosenCandidate = matchedRule
    ? candidateMap.get(matchedRule.courierConfigId)!
    : activeCandidates.sort((a, b) => a.priority - b.priority)[0];

  let chosenPickupLocationId = matchedRule?.pickupLocationId;

  // If no pickup location in rule, pick default from courierPickupMap
  if (!chosenPickupLocationId && pickupLocationsMap) {
    const locData = pickupLocationsMap[chosenCandidate.id];
    const defaultLoc = locData?.locations?.find((l) => l.id === locData.defaultLocationId || l.isDefault) || locData?.locations?.[0];
    chosenPickupLocationId = defaultLoc?.id;
  }

  return {
    courierConfigId: chosenCandidate.id,
    courierName: chosenCandidate.displayName || chosenCandidate.provider.toUpperCase(),
    provider: chosenCandidate.provider,
    pickupLocationId: chosenPickupLocationId,
    zone,
    zoneLabel,
    destinationSummary,
    matchedRuleName: matchedRule?.name || "Priority Default"
  };
}
