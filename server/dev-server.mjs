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

import { proxy, readConfig, statusPayload } from "./planyo-core.mjs";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const md5 = async (text) => createHash("md5").update(text).digest("hex");

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

const planyo = () => readConfig(process.env);

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

async function handleApi(req, res, url) {
  const config = planyo();

  if (url.pathname === "/api/planyo/status") {
    return sendJson(res, 200, statusPayload(config));
  }

  if (url.pathname !== "/api/planyo") {
    return sendJson(res, 404, { error: "unknown endpoint" });
  }

  const payload = req.method === "POST" ? await readBody(req) : Object.fromEntries(url.searchParams);
  const result = await proxy({
    method: payload.method,
    params: payload.params,
    config,
    md5,
  });

  return sendJson(res, result.status, result.body);
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
