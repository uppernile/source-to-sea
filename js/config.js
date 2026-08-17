/* =============================================================
   BOOKING CONFIGURATION
   -------------------------------------------------------------
   Everything commercial about the agent portal lives here so it
   can be changed without touching the booking logic. Nothing in
   this file is secret: the Planyo API key stays on the server
   (see server/dev-server.mjs and .env.example).
   ============================================================= */

window.STS_CONFIG = {
  /* ---- Planyo ------------------------------------------------
     `resourceId` is the boat. `directionProperty` is the name of
     the custom reservation form item in Planyo that records
     which way a charter sailed; the portal reads it to work out
     where the boat is left at the end of each trip. Change it to
     match the field name configured in the Planyo admin panel. */
  planyo: {
    proxy: "/api/planyo",
    resourceId: null,
    directionProperty: "direction",
    startPortProperty: "start_port",
    endPortProperty: "end_port",
  },

  /* ---- the river ---------------------------------------------
     Aswan is the southern end of the run, Luxor the northern,
     with Esna between them. Each route has a minimum length,
     because the sailing itself takes that long. */
  ports: {
    aswan: { id: "aswan", name: "Aswan" },
    esna: { id: "esna", name: "Esna" },
    luxor: { id: "luxor", name: "Luxor" },
  },

  directions: [
    { id: "aswan-esna", from: "aswan", to: "esna", label: "Aswan \u2192 Esna", minNights: 3 },
    { id: "esna-aswan", from: "esna", to: "aswan", label: "Esna \u2192 Aswan", minNights: 3 },
    { id: "aswan-luxor", from: "aswan", to: "luxor", label: "Aswan \u2192 Luxor", minNights: 4 },
    { id: "luxor-aswan", from: "luxor", to: "aswan", label: "Luxor \u2192 Aswan", minNights: 4 },
  ],

  nights: { min: 3, max: 7, default: 4 },

  /* ---- turnaround ---------------------------------------------
     Guests never disembark and embark on the same day. A charter
     ending on the 12th leaves the 13th as the earliest possible
     departure, so every booked charter is treated as blocking a
     day either side of itself. */
  turnaroundDays: 1,

  /* ---- trade rates -------------------------------------------
     Per-night nett rates by partner tier. Live pricing will come
     from Planyo's pricing manager once agent identity is mapped
     to a Planyo user or voucher; until then these drive the
     summary panel so the interface can be reviewed end to end. */
  currency: { code: "USD", symbol: "$" },

  rates: {
    default: { tier: "Published", perNight: 2400 },
    tiers: [
      { code: "UNC-TRADE", tier: "Trade", perNight: 2040, agency: "Trade partner" },
      { code: "UNC-PREF", tier: "Preferred partner", perNight: 1920, agency: "Preferred partner" },
      { code: "UNC-DMC", tier: "DMC", perNight: 1800, agency: "Destination management" },
    ],
  },

  /* ---- fallback data ------------------------------------------
     Used when the Planyo proxy reports that no API key is
     configured, so the portal can be designed and demonstrated
     before credentials are wired up. */
  sampleSchedule: "data/schedule.sample.json",
};
