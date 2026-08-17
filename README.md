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

---

## Publishing

The repository currently publishes to GitHub Pages from `main`:
<https://uppernile.github.io/source-to-sea/>

The whole site works there as static files, including the booking portal, which
falls back to `data/schedule.sample.json`. **GitHub Pages cannot run the Planyo
proxy**, because it only serves files and the proxy needs a process. So the
Pages build shows sample data and says so in a banner.

### Moving to a host that can run the proxy

`functions/` holds a Cloudflare Pages Function version of the proxy. It imports
the same `server/planyo-core.mjs` as the local dev server, so the allow-list and
the request format cannot drift apart between the two.

To deploy:

1. Cloudflare dashboard → Workers & Pages → Create → Pages, **or** a Worker
   with static assets. This repository now includes `wrangler.jsonc` and
   `worker.js` so Workers Builds (`source-to-sea-v2`) can compile the site
   and the Planyo proxy. Pages continues to use the `functions/` directory;
   both import `server/planyo-core.mjs`.
3. Settings → Environment variables → add `PLANYO_API_KEY` (and
   `PLANYO_RESOURCE_ID`, plus `PLANYO_SITE_ID` / `PLANYO_HASH_KEY` if they
   apply). Mark them **encrypted**. They are only ever read server-side.
4. Deploy. Every push to `main` republishes.

The free tier covers a trade portal comfortably and has no commercial-use
restriction. Netlify works the same way if preferred — the function needs
renaming into `netlify/functions/` and a small handler wrapper, but
`planyo-core.mjs` is unchanged.

**Never put the API key in the repository.** It belongs in the host's
environment variables, and in `.env` locally, which is git-ignored.

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
js/config.js          rates, ports, routes and their minimum lengths
js/planyo.js          Planyo adapter with a sample-data fallback
js/booking.js         availability, route rules and pricing

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

### The rules

Aswan is the southern end of the run, Luxor the northern, Esna between them.
Four routes are sold, and each has a minimum length because the sailing takes
that long:

| Route          | Minimum |
| -------------- | ------- |
| Aswan ↔ Esna   | 3 nights |
| Aswan ↔ Luxor  | 4 nights |

Guests never disembark and embark on the same day, so every booked charter
blocks a day either side of itself. A charter ending on the 12th leaves the
13th as the earliest possible departure.

Both rules live in `js/config.js` — `directions[].minNights` and
`turnaroundDays`. `js/booking.js` applies them and resolves a departure to one
of three states:

| State       | When                                                          |
| ----------- | ------------------------------------------------------------- |
| Available   | the selected route fits at the selected length                 |
| Restricted  | the date is sellable, but not this route at this length — the calendar shows the longest stay that does fit |
| Unavailable | nothing can start here: chartered, closed, or in the past      |

The nights control disables lengths below the selected route's minimum, so the
shorter stay is prevented rather than reported.

There is no repositioning charge. Where the boat has to move between the end of
one charter and the start of the next, the office absorbs it.

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

This site's Planyo API accepts **ISO dates** (`YYYY-MM-DD`). The published
Planyo docs still show `DD-MM-YYYY`; sending that here returns
`Error listing reservations`. The proxy converts either form, and the booking
page sends ISO.

To check the connection without loading the page:

```bash
# reaches Planyo and needs no key — proves the proxy round trip works
curl -X POST localhost:4321/api/planyo -H 'content-type: application/json' \
  -d '{"method":"api_test"}'

# the real thing — ISO dates
curl -X POST localhost:4321/api/planyo -H 'content-type: application/json' \
  -d '{"method":"list_reservations","params":{"start_time":"2026-09-01","end_time":"2026-09-30","detail_level":3}}'
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

- Decide whether the homepage should still read "sailing between Aswan and
  Esna" now that Aswan–Luxor charters are sold. The phrase appears in the right
  pane, the Journeys chapter and the About facts.
- Confirm whether Esna–Luxor is ever sold as its own route. Adding it is one
  entry in `directions` in `js/config.js`.
- Map agent identity to Planyo so trade rates come from the pricing manager
  rather than `js/config.js`.
- Enable `make_reservation` so a request becomes a provisional booking.
- Replace Georgia with the licensed brand typeface. It is set in one place,
  `--serif` in `css/base.css`. Note that changing it changes text metrics, so
  re-check the chapter boxes with the grid overlay afterwards.
- Artwork and copy for the Editions chapter beyond the placeholder card.
