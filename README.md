# Source to Sea — Upper Nile Collection

An editorial site for a private dahabiya charter sailing between Aswan and Esna,
plus a booking portal for travel partners built around Planyo.

Static HTML, CSS and vanilla JavaScript. No build step, no framework, no
dependencies to install.

---

## Running it

```bash
npm run dev
```

Then open <http://localhost:4321>. The booking portal is at
<http://localhost:4321/booking.html>.

The server is a single dependency-free Node file (`server/dev-server.mjs`) that
serves the site and proxies Planyo. Node 18 or later.

You can also open `index.html` straight off disk, but the booking portal needs
a server of some kind: browsers block `fetch` from `file://`, so the calendar
will not load.

### On a phone

`npm run dev` prints a second address on start, something like
`http://192.168.1.24:4321`. Open that on a phone connected to the same Wi-Fi.
Nothing to configure — the server already listens on every interface.

### Published

The repository publishes to GitHub Pages from `main`:
<https://uppernile.github.io/source-to-sea/>

The whole site works there as static files, including the booking portal, which
falls back to `data/schedule.sample.json`. **Pages cannot run the Planyo proxy**,
because it only serves static files and the proxy is a Node process. Live Planyo
availability needs a host that can run server code — a small Node host, or a
serverless function on Netlify, Vercel or Cloudflare reusing the logic in
`server/dev-server.mjs`. Until then the published site shows sample data and
says so in a banner.

---

## Layout

```
index.html            the homepage
booking.html          the agent booking portal

css/base.css          design tokens, reset, header and footer
css/home.css          the measured composition system
css/booking.css       the portal
css/grid-overlay.css  development only, see "Art-directing" below

js/river.js           lays out the continuous Nile
js/home.js            chapter index + the measurement overlay
js/config.js          rates, ports, nights, repositioning rules
js/planyo.js          Planyo adapter with a sample-data fallback
js/booking.js         availability, repositioning and pricing logic

assets/               web-ready artwork, generated (see below)
data/                 sample charter schedule
tools/                asset pipeline and screenshot tooling
server/               static server + Planyo proxy
*.png                 the original artwork masters, in the project root
```

---

## Artwork

The masters stay in the project root exactly as exported. `assets/` holds
web-ready derivatives generated from them:

```bash
npm run assets     # needs: pip install pillow
```

The script (`tools/build-assets.py`) does three things that matter:

1. **Trims the transparent padding.** The exports carry a lot of empty space
   around the artwork, which meant the box positioned in CSS was not the box
   seen on screen — the single biggest cause of layout guesswork. After trimming,
   an image's box *is* its artwork.
2. **Forces the torn-paper circles back to true circles.** The scans are about
   2.8% wider than they are tall, which reads as an oval at 200px and up.
3. **Downsizes and re-encodes to WebP**, taking the page from roughly 17 MB of
   imagery to about 1 MB.

Re-run it whenever the artwork in the root changes. Nothing in `assets/` should
be edited by hand.

---

## The homepage composition system

The point of this system is that the composition is defined by a handful of
named numbers, not by nudging individual images. All of them live at the top of
`css/home.css`:

| Token         | At 1440×900 | What it controls                       |
| ------------- | ----------- | -------------------------------------- |
| `--pane-left` | 864px (60vw) | the scrolling journey                 |
| `--pane-right`| 576px (40vw) | the sticky editorial pane             |
| `--seam`      | 864px        | the river's centreline                |
| `--river-w`   | 223px        | the watercolour's width               |
| `--river-top` | 132px        | where the river begins, below the nav |
| `--stage-x`   | 72px         | left inset of the collage stage       |
| `--stage-w`   | 760px        | width of the collage stage            |

`--bank` is derived from those: the distance from the stage's left edge to the
river's left bank, about 90% of the stage. Anything placed past roughly 82% of
the stage grows into the river, which is what stitches the two panes together.

Each chapter is **one bounding box** with a fixed aspect ratio (`--scene-ar`),
sized 760 × 620–660 at the reference viewport. Every asset inside it is
positioned as a percentage of that box, so the collage moves and scales as a
single group and can never reflow into a different arrangement. No image is
given both a width and a height, so nothing can be distorted.

To move a whole collage, change its box. To restyle the composition globally,
change a token. Individual `left`/`top`/`width` values should be the last thing
you touch, not the first.

### Art-directing

Press **`g`** on the homepage, or load `/?grid`, to draw the seam, both river
banks, the collage stage and every chapter box with its measured dimensions.
Use it to check a change against the real page rather than estimating.

To capture a review set across viewports and interaction states:

```bash
npm run dev              # in one terminal
node tools/shots.mjs     # writes to /tmp/shots
```

### The Nile

The watercolour is a single 456 × 900 painting. `js/river.js` carries it down a
page thousands of pixels tall by laying out tiles that keep its natural aspect
ratio, alternate a vertical mirror so the meander continues across each join
instead of jumping, and overlap by exactly the mask fade so neighbours
cross-dissolve. It is never stretched and never repeats as a recognisable tile.

The river is a child of `.river-stage`, not of either pane, so it genuinely sits
over the seam and overlaps both sides. It begins below the navigation and fades
out where the story resolves, after which the page goes quiet and full width for
About.

---

## The booking portal

Three inputs: **date → nights → direction**. No predefined itineraries.

### Repositioning

A charter can only begin where the boat actually is, and every trip ends at the
far end of the run. So the direction that can be sold on a date depends on the
charter before it. `js/booking.js` reads the schedule, works out which port the
boat is left in, and resolves a requested departure to one of four states:

| State                | When                                                        |
| -------------------- | ----------------------------------------------------------- |
| Available            | the boat is already at the start port, or there is enough slack for the move to absorb into normal operations |
| Available + fee      | the boat must sail empty to reach the start port, and there is time to do it |
| Direction restricted | the boat cannot reach the start port in time                 |
| Unavailable          | the dates are chartered, closed, or in the past              |

The thresholds and the fee are placeholders in `js/config.js`
(`repositioning.minDays`, `freeAfterDays`, `fee`) pending confirmation of the
operational rules and how they are best expressed in Planyo. Nothing about the
rule is hard-coded into the interface.

### Rates

Agent identity comes from a partner code, which selects a rate tier in
`js/config.js`. Real identity will come from a Planyo login, user record or
voucher code; the shape of the interface does not change when it does.

### Connecting Planyo

Planyo is the inventory system and the portal does not try to replace it. Two
read methods do the work:

- `list_reservations` — the charters, and the custom form item recording each
  one's direction, which is what tells us where the boat was left
- `get_resource_usage` — vacations and blocked time, greyed out in the calendar

Both go through `/api/planyo` on the server, which holds the API key. Planyo's
documentation requires this: the key must not reach client-side JavaScript. The
proxy also enforces an allow-list of read-only methods.

To connect:

1. `cp .env.example .env`
2. Fill in `PLANYO_API_KEY`, and `PLANYO_RESOURCE_ID` for Razis.
3. In Planyo, add a custom reservation form item recording each charter's
   direction, and set `planyo.directionProperty` in `js/config.js` to its name.
   Alternatively record start and end ports separately and set
   `startPortProperty` / `endPortProperty`.
4. Restart the server. The banner at the top of the portal reports whether it is
   running on live data or on `data/schedule.sample.json`.

To check the connection without loading the page:

```bash
# reaches Planyo and needs no key — proves the proxy round trip works
curl -X POST localhost:4321/api/planyo -H 'content-type: application/json' \
  -d '{"method":"api_test"}'

# the real thing
curl -X POST localhost:4321/api/planyo -H 'content-type: application/json' \
  -d '{"method":"list_reservations","params":{"start_time":"01-09-2026","end_time":"30-09-2026","detail_level":3}}'
```

With no key configured everything still runs against the sample schedule, so the
portal can be reviewed and demonstrated before credentials exist. If a key *is*
configured but the call fails, the portal falls back to the sample schedule and
prints Planyo's own error message in the banner.

Submitting a request currently prepares and displays the payload rather than
writing to Planyo. Turning that into a real reservation means enabling
`make_reservation` on the API key and adding it to the proxy's allow-list — a
deliberate next step rather than an oversight, since it is the first call that
writes.

---

## Known next steps

- Confirm how repositioning should be modelled in Planyo (a resource-level rule,
  a pricing-manager rule, or a separate resource) before the placeholder
  thresholds are treated as real.
- Map agent identity to Planyo so trade rates come from the pricing manager
  rather than `js/config.js`.
- Enable `make_reservation` so a request becomes a provisional booking.
- Replace Georgia with the licensed brand typeface. It is set in one place,
  `--serif` in `css/base.css`. Note that changing it changes text metrics, so
  re-check the chapter boxes with the grid overlay afterwards.
- Artwork and copy for the Editions chapter beyond the placeholder card.
