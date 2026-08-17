/* =============================================================
   PLANYO PROXY — shared logic
   -------------------------------------------------------------
   The browser must never see the Planyo API key; Planyo's own
   documentation says so, and if it did, anyone could read the
   booking data out of the page source. So every call is made
   server-side.

   "Server-side" means two different runtimes: the local Node dev
   server, and whatever hosts the published site. Both use this
   module, so the allow-list and the request format cannot drift
   apart between them. The only thing each runtime supplies is an
   MD5 function, because Node and the edge runtimes expose it
   differently.
   ============================================================= */

export const PLANYO_ENDPOINT = "https://www.planyo.com/rest/";

/* Only these methods may be reached from the browser. Everything
   that writes, and everything that could expose the customer
   database, stays off the list until it is needed and reviewed.
   `make_reservation` is the deliberate next addition. */
export const ALLOWED_METHODS = new Set([
  "api_test",
  "get_site_info",
  "list_resources",
  "get_resource_info",
  "get_resource_usage",
  "get_resource_usage_for_month",
  "is_resource_available",
  "can_make_reservation",
  "list_reservations",
  "get_reservation_price",
  "get_simplified_daily_pricing",
]);

/** Reads the four settings from any environment-shaped object. */
export function readConfig(env) {
  return {
    apiKey: env.PLANYO_API_KEY || "",
    hashKey: env.PLANYO_HASH_KEY || "",
    siteId: env.PLANYO_SITE_ID || "",
    resourceId: env.PLANYO_RESOURCE_ID || "",
  };
}

/** What the browser is allowed to know: whether we are connected. */
export function statusPayload(config) {
  return {
    configured: Boolean(config.apiKey),
    siteId: config.siteId || null,
    resourceId: config.resourceId || null,
    methods: [...ALLOWED_METHODS],
  };
}

async function buildUrl(method, params, config, md5) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }

  query.set("method", method);
  query.set("api_key", config.apiKey);

  if (config.hashKey) {
    // md5(hashKey + timestamp + method), per Planyo's request format
    const timestamp = Math.floor(Date.now() / 1000);
    query.set("hash_timestamp", String(timestamp));
    query.set("hash_key", await md5(config.hashKey + timestamp + method));
  }

  return `${PLANYO_ENDPOINT}?${query}`;
}

/**
 * Forwards one call to Planyo.
 * Returns { status, body } ready to be sent back as JSON.
 */
export async function proxy({ method, params, config, md5, fetchImpl = fetch }) {
  if (!config.apiKey) {
    return {
      status: 503,
      body: {
        error: "planyo_not_configured",
        message:
          "Set PLANYO_API_KEY (see .env.example) to connect the booking portal to live availability.",
      },
    };
  }

  if (!ALLOWED_METHODS.has(method)) {
    return {
      status: 400,
      body: {
        error: "method_not_allowed",
        message: `"${method}" is not in the proxy allow-list.`,
      },
    };
  }

  const merged = { ...(params || {}) };
  if (config.siteId && !merged.site_id) merged.site_id = config.siteId;

  try {
    const response = await fetchImpl(await buildUrl(method, merged, config, md5), {
      headers: { accept: "application/json" },
    });
    const text = await response.text();

    try {
      return { status: response.ok ? 200 : 502, body: JSON.parse(text) };
    } catch {
      return {
        status: 502,
        body: { response_code: -1, response_message: text.slice(0, 400) },
      };
    }
  } catch (error) {
    return {
      status: 502,
      body: { error: "planyo_unreachable", message: String(error) },
    };
  }
}
