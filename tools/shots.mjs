/* Capture review screenshots of the running site.
 *
 *   node tools/shots.mjs [baseUrl] [outDir]
 *
 * Drives one long-lived headless Chrome over the DevTools
 * protocol so a full review pass takes seconds rather than a
 * browser launch per frame. Shots are written as
 * <name>.png in the output directory.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:4321";
const OUT = process.argv[3] || "/tmp/shots";

const FRAMES = [
  { name: "01-home-1440-top", path: "/", w: 1440, h: 900, y: 0 },
  { name: "02-home-1440-collection", path: "/", w: 1440, h: 900, y: 520 },
  { name: "03-home-1440-journeys", path: "/", w: 1440, h: 900, y: 1150 },
  { name: "04-home-1440-editions", path: "/", w: 1440, h: 900, y: 1850 },
  { name: "05-home-1440-close", path: "/", w: 1440, h: 900, y: 2450 },
  { name: "06-home-1440-about", path: "/", w: 1440, h: 900, y: 3000 },
  { name: "07-home-1440-grid", path: "/?grid", w: 1440, h: 900, y: 0 },
  { name: "08-home-1280", path: "/", w: 1280, h: 800, y: 0 },
  { name: "09-home-390", path: "/", w: 390, h: 844, y: 0 },
  { name: "10-home-390-collection", path: "/", w: 390, h: 844, y: 900 },
  { name: "11-booking-1440-top", path: "/booking.html", w: 1440, h: 900, y: 0 },
  { name: "12-booking-1440-calendar", path: "/booking.html", w: 1440, h: 900, y: 620 },
  { name: "13-booking-1440-lower", path: "/booking.html", w: 1440, h: 900, y: 1250 },
  { name: "14-booking-390", path: "/booking.html", w: 390, h: 844, y: 0 },
  { name: "15-booking-390-calendar", path: "/booking.html", w: 390, h: 844, y: 850 },
  {
    name: "16-booking-selected",
    path: "/booking.html",
    w: 1440,
    h: 900,
    y: 560,
    act: `
      document.querySelector('#partner-code').value = 'UNC-PREF';
      document.querySelector('[data-partner-form] button').click();
      document.querySelector('[data-month-next]').click();
      document.querySelector('[data-day="2026-09-18"]').click();
    `,
  },
  {
    name: "17-booking-luxor-min-nights",
    path: "/booking.html",
    w: 1440,
    h: 900,
    y: 300,
    act: `
      document.querySelector('[data-direction="aswan-luxor"]').click();
      document.querySelector('[data-month-next]').click();
    `,
  },
  {
    name: "19-booking-restricted",
    path: "/booking.html",
    w: 1440,
    h: 900,
    y: 620,
    act: `
      document.querySelector('[data-direction="aswan-luxor"]').click();
      document.querySelector('[data-night="7"]').click();
      document.querySelector('[data-month-next]').click();
      document.querySelector('[data-day="2026-09-17"]').click();
    `,
  },
  {
    name: "18-booking-request",
    path: "/booking.html",
    w: 1440,
    h: 1200,
    y: 1400,
    act: `
      document.querySelector('[data-month-next]').click();
      document.querySelector('[data-day="2026-09-17"]').click();
      document.querySelector('#agency').value = 'Wayfarer Travel';
      document.querySelector('#consultant').value = 'A. Fahmy';
      document.querySelector('#email').value = 'trade@wayfarer.example';
      document.querySelector('[data-request-form] button[type=submit]').click();
    `,
  },
  {
    name: "20-booking-refused",
    path: "/booking.html",
    w: 1440,
    h: 1200,
    y: 1400,
    act: `
      document.querySelector('[data-month-next]').click();
      document.querySelector('[data-day="2026-09-18"]').click();
      document.querySelector('#agency').value = 'Wayfarer Travel';
      document.querySelector('#consultant').value = 'A. Fahmy';
      document.querySelector('#email').value = 'trade@wayfarer.example';
      document.querySelector('[data-request-form] button[type=submit]').click();
    `,
  },
];

const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const frames = only ? FRAMES.filter((f) => only.test(f.name)) : FRAMES;

const profile = mkdtempSync(join(tmpdir(), "sts-chrome-"));
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--remote-debugging-port=9333",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore"] }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint never came up");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();

    ws.addEventListener("open", () =>
      resolve({
        send(method, params) {
          return new Promise((res, rej) => {
            const messageId = ++id;
            pending.set(messageId, { res, rej });
            ws.send(JSON.stringify({ id: messageId, method, params: params || {} }));
          });
        },
        close: () => ws.close(),
      })
    );
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      message.error ? entry.rej(new Error(message.error.message)) : entry.res(message.result);
    });
  });
}

const cdp = await connect(await findTarget());
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

let previous = "";

for (const frame of frames) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: frame.w,
    height: frame.h,
    deviceScaleFactor: 1,
    mobile: frame.w < 700,
  });

  const url = BASE + frame.path;
  if (url !== previous) {
    await cdp.send("Page.navigate", { url });
    await sleep(1400);
    previous = url;
  }

  if (frame.act) {
    const outcome = await cdp.send("Runtime.evaluate", {
      expression: `(function(){${frame.act}})()`,
      awaitPromise: true,
    });
    if (outcome.exceptionDetails) {
      console.error(`  ! ${frame.name}: ${outcome.exceptionDetails.text}`);
      console.error(`    ${outcome.exceptionDetails.exception?.description || ""}`);
    }
    await sleep(400);
  }

  await cdp.send("Runtime.evaluate", {
    expression: `window.scrollTo({top:${frame.y},behavior:'instant'});`,
  });
  await sleep(500);

  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${frame.name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`  ${frame.name}.png`);

  // force a reload for the next frame so scroll-driven state is clean
  if (frames.indexOf(frame) < frames.length - 1) previous = "";
}

cdp.close();
chrome.kill();
await sleep(400);
rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log(`\nwrote ${frames.length} shots to ${OUT}`);
