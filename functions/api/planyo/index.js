/* Cloudflare Pages Function — POST /api/planyo
 *
 * The published equivalent of the local dev server's proxy. Same
 * allow-list, same request format: both import server/planyo-core.mjs
 * so they cannot drift apart.
 *
 * The API key comes from the Pages project's environment variables
 * and never reaches the browser. See README, "Publishing".
 */

import { proxy, readConfig } from "../../../server/planyo-core.mjs";

/* Planyo can require an MD5 hash key. Node and the edge runtime
   expose MD5 differently; Cloudflare supports it as a non-standard
   extension to crypto.subtle. */
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

export async function onRequestPost(context) {
  let payload = {};
  try {
    payload = await context.request.json();
  } catch {
    /* an empty body falls through to the allow-list check */
  }

  const result = await proxy({
    method: payload.method,
    params: payload.params,
    config: readConfig(context.env),
    md5,
  });

  return json(result.status, result.body);
}

export function onRequestGet() {
  return json(405, { error: "method_not_allowed", message: "Use POST." });
}
