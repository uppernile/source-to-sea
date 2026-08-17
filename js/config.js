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

  /* ---- the river --------------------------------------------- */
  ports: {
    aswan: { id: "aswan", name: "Aswan" },
    esna: { id: "esna", name: "Esna" },
  },

  directions: [
    { id: "aswan-esna", from: "aswan", to: "esna", label: "Aswan \u2192 Esna" },
    { id: "esna-aswan", from: "esna", to: "aswan", label: "Esna \u2192 Aswan" },
  ],

  nights: { min: 3, max: 7, default: 4 },

  /* ---- repositioning -----------------------------------------
     A charter can only begin where the boat actually is. If the
     previous charter finished at the other end of the run, the
     boat has to be repositioned first.

     `minDays` is the sailing time needed to move the boat
     between Aswan and Esna without guests aboard. With less
     clear water than that the departure is impossible and the
     calendar marks the date as direction-restricted.

     `freeAfterDays` is the gap beyond which the move absorbs
     into normal operations and costs the agent nothing. Between
     the two, the departure is offered with the fee shown as its
     own line in the summary.

     These are placeholders until the operational rules and the
     Planyo pricing rules are confirmed. */
  repositioning: {
    minDays: 2,
    freeAfterDays: 7,
    fee: 950,
    note: "Charged when the boat must sail without guests to reach your start port.",
  },

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
