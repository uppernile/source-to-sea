/* =============================================================
   Source to Sea — local server
   -------------------------------------------------------------
   Two jobs, no dependencies:

     1. serve the static site
     2. proxy /api/planyo/* to Planyo's REST endpoint

   The proxy exists because Planyo's own documentation is
   explicit that the API key must never appear in client-side
   JavaScript. The browser therefore only ever talks to this
   server, which holds the key and only forwards the handful of
   read methods the booking portal needs.

       node server/dev-server.mjs          # http://localhost:4321
       PORT=8080 node server/dev-server.mjs

   Credentials come from the environment or a local .env file
   (see .env.example). With none configured the site still runs:
   the booking portal falls back to data/schedule.sample.json and
   says so in the interface.
   ============================================================= */

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const PLANYO_ENDPOINT = "https://www.planyo.com/rest/";

/* Only these methods may be reached from the browser. Anything
   that writes, or that could leak the customer database, stays
   off the list until it is needed and reviewed. */
const ALLOWED_METHODS = new Set([
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

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/* ---- environment ------------------------------------------- */

async function loadEnvFile() {
  try {
    const text = await readFile(join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    /* no .env, which is fine */
  }
}

const planyo = () => ({
  apiKey: process.env.PLANYO_API_KEY || "",
  hashKey: process.env.PLANYO_HASH_KEY || "",
  siteId: process.env.PLANYO_SITE_ID || "",
  resourceId: process.env.PLANYO_RESOURCE_ID || "",
});

/* ---- responses --------------------------------------------- */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/* ---- Planyo ------------------------------------------------- */

async function callPlanyo(method, params) {
  const config = planyo();
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
    query.set(
      "hash_key",
      createHash("md5").update(config.hashKey + timestamp + method).digest("hex")
    );
  }

  const response = await fetch(`${PLANYO_ENDPOINT}?${query}`, {
    headers: { accept: "application/json" },
  });
  const text = await response.text();

  try {
    return { ok: response.ok, body: JSON.parse(text) };
  } catch {
    return { ok: false, body: { response_code: -1, response_message: text.slice(0, 400) } };
  }
}

async function handleApi(req, res, url) {
  const config = planyo();

  if (url.pathname === "/api/planyo/status") {
    return sendJson(res, 200, {
      configured: Boolean(config.apiKey),
      siteId: config.siteId || null,
      resourceId: config.resourceId || null,
      methods: [...ALLOWED_METHODS],
    });
  }

  if (url.pathname !== "/api/planyo") {
    return sendJson(res, 404, { error: "unknown endpoint" });
  }

  if (!config.apiKey) {
    return sendJson(res, 503, {
      error: "planyo_not_configured",
      message:
        "Set PLANYO_API_KEY (see .env.example) to connect the booking portal to live availability.",
    });
  }

  const payload = req.method === "POST" ? await readBody(req) : Object.fromEntries(url.searchParams);
  const method = payload.method;

  if (!ALLOWED_METHODS.has(method)) {
    return sendJson(res, 400, {
      error: "method_not_allowed",
      message: `"${method}" is not in the proxy allow-list.`,
    });
  }

  try {
    const params = { ...(payload.params || {}) };
    if (config.siteId && !params.site_id) params.site_id = config.siteId;

    const result = await callPlanyo(method, params);
    return sendJson(res, result.ok ? 200 : 502, result.body);
  } catch (error) {
    return sendJson(res, 502, { error: "planyo_unreachable", message: String(error) });
  }
}

/* ---- static ------------------------------------------------- */

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) return serveStatic(req, res, new URL(pathname + "/", url));

    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>404</h1><p>Not found.</p>");
  }
}

/* ---- boot ---------------------------------------------------- */

await loadEnvFile();

const port = Number(process.env.PORT || 4321);

/** The address a phone on the same Wi-Fi can reach this machine on. */
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(req, res, url);
}).listen(port, () => {
  const config = planyo();
  const lan = lanAddress();

  console.log(`\n  Source to Sea  →  http://localhost:${port}`);
  console.log(`  booking portal →  http://localhost:${port}/booking.html`);
  if (lan) console.log(`  on your phone  →  http://${lan}:${port}   (same Wi-Fi)`);
  console.log(
    `  planyo         →  ${
      config.apiKey ? "connected via /api/planyo" : "not configured, using data/schedule.sample.json"
    }\n`
  );
});
