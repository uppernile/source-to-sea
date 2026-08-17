/* =============================================================
   PLANYO ADAPTER
   -------------------------------------------------------------
   Planyo is the inventory system. This file does not reimplement
   it — it translates between Planyo's reservation records and
   the two things the agent portal actually needs to know:

     1. which nights the boat is already committed or closed
     2. which port the boat is left in after each charter,
        because that decides whether a requested direction is
        possible without repositioning

   Every call goes through the server proxy at /api/planyo, which
   holds the API key. Planyo's documentation is explicit that the
   key must never reach client-side JavaScript.

   With no key configured the proxy answers 503 and this adapter
   transparently falls back to data/schedule.sample.json, so the
   portal is reviewable before credentials exist. Callers can
   check `source` to find out which of the two they got.
   ============================================================= */

(function (global) {
  "use strict";

  var config = global.STS_CONFIG;

  function iso(date) {
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function parseIso(text) {
    var parts = String(text).slice(0, 10).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /* Planyo takes and returns dates as "DD-MM-YYYY HH:MM". */
  function toPlanyoDate(date) {
    return (
      String(date.getDate()).padStart(2, "0") +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      date.getFullYear()
    );
  }

  function fromPlanyoDate(text) {
    var match = /^(\d{2})-(\d{2})-(\d{4})/.exec(String(text));
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    var parsed = new Date(text);
    return isNaN(parsed) ? null : parsed;
  }

  var status = null;

  function getStatus() {
    if (status) return status;
    status = fetch(config.planyo.proxy + "/status")
      .then(function (response) {
        return response.ok ? response.json() : { configured: false };
      })
      .catch(function () {
        return { configured: false, offline: true };
      });
    return status;
  }

  function call(method, params) {
    return fetch(config.planyo.proxy, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: method, params: params || {} }),
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw Object.assign(new Error(body.message || "Planyo error"), body);
        if (body.response_code !== 0) {
          throw new Error(body.response_message || "Planyo returned an error");
        }
        return body.data;
      });
    });
  }

  /* ---- normalising ------------------------------------------
     Both sources are reduced to the same shape:
       { start: Date, end: Date, direction, from, to, status } */

  function directionOf(record) {
    var props = record.properties || record.resource_properties || {};
    var raw =
      record.direction ||
      props[config.planyo.directionProperty] ||
      props.Direction ||
      "";

    raw = String(raw).toLowerCase();

    var match = config.directions.filter(function (direction) {
      return (
        raw === direction.id ||
        raw.replace(/[^a-z]/g, "") === (direction.from + direction.to) ||
        (raw.indexOf(direction.from) === 0 && raw.indexOf(direction.to) > 0)
      );
    })[0];

    if (match) return match;

    // fall back to the explicit port fields if the site records
    // start/end ports rather than a single direction value
    var from = String(props[config.planyo.startPortProperty] || "").toLowerCase();
    var to = String(props[config.planyo.endPortProperty] || "").toLowerCase();
    return (
      config.directions.filter(function (direction) {
        return direction.from === from && direction.to === to;
      })[0] || null
    );
  }

  function normalise(record) {
    var start = record.start instanceof Date ? record.start : fromPlanyoDate(record.start_time || record.start);
    var end = record.end instanceof Date ? record.end : fromPlanyoDate(record.end_time || record.end);
    if (!start || !end) return null;

    var direction = directionOf(record);

    return {
      start: start,
      end: end,
      direction: direction ? direction.id : null,
      from: direction ? direction.from : null,
      to: direction ? direction.to : null,
      status: String(record.status || "confirmed").toLowerCase(),
    };
  }

  /* ---- sources ----------------------------------------------- */

  function loadSample() {
    return fetch(config.sampleSchedule)
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        var directions = {};
        config.directions.forEach(function (direction) {
          directions[direction.id] = direction;
        });

        return {
          source: "sample",
          homePort: data.homePort,
          charters: data.charters
            .map(function (charter) {
              var direction = directions[charter.direction];
              return {
                start: parseIso(charter.start),
                end: parseIso(charter.end),
                direction: charter.direction,
                from: direction ? direction.from : null,
                to: direction ? direction.to : null,
                status: charter.status,
              };
            })
            .sort(function (a, b) {
              return a.start - b.start;
            }),
          closures: (data.closures || []).map(function (closure) {
            return {
              start: parseIso(closure.start),
              end: parseIso(closure.end),
              reason: closure.reason,
            };
          }),
        };
      });
  }

  function loadPlanyo(from, to, resourceId) {
    var params = {
      start_time: toPlanyoDate(from),
      end_time: toPlanyoDate(to),
      // 1 = reservation info, 2 = the reservation form items, which
      // is where the charter's direction is recorded
      detail_level: 3,
      resource_id: resourceId || undefined,
    };

    return Promise.all([
      call("list_reservations", params),
      call("get_resource_usage", {
        resource_id: resourceId || undefined,
        start_date: toPlanyoDate(from),
        end_date: toPlanyoDate(to),
        separate_periods: true,
        return_as_text: true,
      }).catch(function () {
        return null;
      }),
    ]).then(function (results) {
      var reservations = results[0] || [];
      var usage = results[1];

      var charters = (Array.isArray(reservations) ? reservations : Object.values(reservations))
        .map(normalise)
        .filter(Boolean)
        .filter(function (charter) {
          return charter.status !== "cancelled" && charter.status !== "rejected";
        })
        .sort(function (a, b) {
          return a.start - b.start;
        });

      /* Usage periods that no reservation accounts for are
         vacations or blocked time in Planyo — treat them as
         closures so the calendar greys them out. */
      var closures = [];
      if (usage) {
        Object.keys(usage).forEach(function (key) {
          var periods = usage[key];
          if (!Array.isArray(periods)) return;
          periods.forEach(function (period) {
            if (!period.q) return;
            var start = fromPlanyoDate(period.from) || new Date(period.from * 1000);
            var end = fromPlanyoDate(period.to) || new Date(period.to * 1000);
            var covered = charters.some(function (charter) {
              return charter.start <= start && charter.end >= end;
            });
            if (!covered) closures.push({ start: start, end: end, reason: "Unavailable" });
          });
        });
      }

      return { source: "planyo", charters: charters, closures: closures, homePort: null };
    });
  }

  /* ---- public ------------------------------------------------ */

  global.STS_PLANYO = {
    iso: iso,
    parseIso: parseIso,
    getStatus: getStatus,
    call: call,

    /** Charter schedule for a window, from Planyo or the sample. */
    getSchedule: function (from, to) {
      return getStatus().then(function (state) {
        if (!state.configured) return loadSample();
        return loadPlanyo(from, to, state.resourceId || config.planyo.resourceId).catch(function (error) {
          console.warn("Planyo unavailable, falling back to the sample schedule:", error.message);
          return loadSample().then(function (data) {
            data.source = "fallback";
            data.error = error.message;
            return data;
          });
        });
      });
    },
  };
})(window);
