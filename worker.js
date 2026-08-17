/* Cloudflare Worker — static site + Planyo proxy
 *
 * Workers Builds (source-to-sea-v2) needs an entry script. Pages
 * still uses functions/; both import server/planyo-core.mjs so the
 * allow-list cannot drift.
 */

import { proxy, readConfig, statusPayload } from "./server/planyo-core.mjs";

async function md5(text) {
  const digest = await crypto.subtle.digest("MD5", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handlePlanyo(request, env) {
  const url = new URL(request.url);
  const config = readConfig(env);

  if (url.pathname === "/api/planyo/status" || url.pathname === "/api/planyo/status/") {
    if (request.method !== "GET") return json(405, { error: "method_not_allowed", message: "Use GET." });
    return json(200, statusPayload(config));
  }

  if (url.pathname === "/api/planyo" || url.pathname === "/api/planyo/") {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed", message: "Use POST." });

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      /* empty body falls through to the allow-list */
    }

    const result = await proxy({
      method: payload.method,
      params: payload.params,
      config,
      md5,
    });
    return json(result.status, result.body);
  }

  return json(404, { error: "unknown endpoint" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/planyo" || url.pathname.startsWith("/api/planyo/")) {
      return handlePlanyo(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
