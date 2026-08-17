/* Cloudflare Pages Function — GET /api/planyo/status
 *
 * Tells the booking portal whether live availability is available.
 * Deliberately reports only whether a key is present, never the key.
 */

import { readConfig, statusPayload } from "../../../server/planyo-core.mjs";

export function onRequestGet(context) {
  return new Response(JSON.stringify(statusPayload(readConfig(context.env))), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
