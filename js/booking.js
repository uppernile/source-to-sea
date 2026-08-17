/* =============================================================
   AGENT BOOKING PORTAL
   -------------------------------------------------------------
   Three inputs — date, nights, direction — resolved against the
   boat's actual movements.

   The rule that makes this different from a normal availability
   calendar is that a charter can only begin where the boat is.
   The boat ends every trip at the far end of the run, so the
   direction an agent can sell on a given date depends on the
   charter before it. Where the ports do not match, the boat has
   to sail empty to reach the start port: allowed if there is
   enough clear water in the schedule, priced as a repositioning
   charge, and refused outright when there is not.

   None of that is hard-coded into Planyo. The schedule comes
   from Planyo (see js/planyo.js), the rules and money come from
   js/config.js, and this file only decides what an agent may
   choose.
   ============================================================= */

(function () {
  "use strict";

  var config = window.STS_CONFIG;
  var planyo = window.STS_PLANYO;

  var DAY = 86400000;

  var directions = config.directions;
  var directionsById = {};
  directions.forEach(function (direction) {
    directionsById[direction.id] = direction;
  });

  var state = {
    schedule: null,
    source: null,
    month: startOfMonth(new Date()),
    date: null,
    nights: config.nights.default,
    direction: directions[0].id,
    rate: config.rates.default,
  };

  /* ---- dates -------------------------------------------------- */

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addDays(date, count) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
  }

  function daysBetween(from, to) {
    return Math.round((startOfDay(to) - startOfDay(from)) / DAY);
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  var LONG_DATE = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  var MONTH_LABEL = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

  var MONEY = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.currency.code,
    maximumFractionDigits: 0,
  });

  /* ---- where is the boat? -------------------------------------
     The port the boat is sitting in on a given morning, plus how
     long it has been there. `null` means we have no charter
     history to go on, in which case any direction is offered and
     the office confirms. */

  function boatAt(date) {
    var schedule = state.schedule;
    if (!schedule) return { port: null, since: null, free: Infinity };

    var previous = null;
    schedule.charters.forEach(function (charter) {
      if (charter.end <= date && (!previous || charter.end > previous.end)) previous = charter;
    });

    /* Nothing in the schedule has moved the boat yet, so there is
       no position to work around and the office places it as part
       of the normal turnaround. */
    if (!previous) return { port: null, since: null, free: Infinity };

    return {
      port: previous.to,
      since: previous.end,
      free: daysBetween(previous.end, date),
    };
  }

  /* ---- can this departure be sold? ----------------------------
     Returns one of:
       available   — sail as asked
       reposition  — sail as asked, boat moves empty first
       restricted  — the boat cannot reach this start port in time
       unavailable — the dates themselves are taken, closed or past */

  function evaluate(date, nights, directionId) {
    var schedule = state.schedule;
    var direction = directionsById[directionId];
    if (!schedule || !direction) return { status: "unavailable", reason: "No schedule loaded." };

    var start = startOfDay(date);
    var end = addDays(start, nights);

    if (start < startOfDay(new Date())) {
      return { status: "unavailable", reason: "In the past." };
    }

    var clash = schedule.charters.filter(function (charter) {
      return overlaps(start, end, charter.start, charter.end);
    })[0];

    if (clash) {
      return { status: "unavailable", reason: "Razis is already chartered on these dates." };
    }

    var closure = (schedule.closures || []).filter(function (period) {
      return overlaps(start, end, period.start, addDays(period.end, 1));
    })[0];

    if (closure) {
      return { status: "unavailable", reason: closure.reason || "The boat is out of service." };
    }

    var position = boatAt(start);

    if (!position.port || position.port === direction.from) {
      return { status: "available", position: position };
    }

    /* The boat finished its last charter at the other end of the
       run, so it has to sail empty to the requested start port. */
    var clearDays = position.free;
    var needed = config.repositioning.minDays;
    var free = config.repositioning.freeAfterDays;

    if (clearDays >= free) {
      return { status: "available", position: position };
    }

    if (clearDays < needed) {
      return {
        status: "restricted",
        position: position,
        reason:
          "Razis finishes in " +
          portName(position.port) +
          " " +
          (clearDays === 0 ? "the same day" : clearDays + " day" + (clearDays === 1 ? "" : "s") + " before") +
          ". Repositioning to " +
          portName(direction.from) +
          " needs " +
          needed +
          " days.",
      };
    }

    /* Repositioning also has to fit between the previous charter
       and this one without colliding with anything else. */
    var moveStart = addDays(start, -needed);
    var blocked = schedule.charters.some(function (charter) {
      return overlaps(moveStart, start, charter.start, charter.end);
    });

    if (blocked) {
      return {
        status: "restricted",
        position: position,
        reason: "There is no clear water to reposition Razis before this departure.",
      };
    }

    return {
      status: "reposition",
      position: position,
      fee: config.repositioning.fee,
      reason:
        "Razis is left in " +
        portName(position.port) +
        " and sails empty to " +
        portName(direction.from) +
        " before you board.",
    };
  }

  /** The best outcome across both directions, for colouring a day. */
  function evaluateDay(date, nights) {
    var chosen = evaluate(date, nights, state.direction);
    return chosen;
  }

  function portName(id) {
    var port = config.ports[id];
    return port ? port.name : id || "port";
  }

  /* ---- money --------------------------------------------------- */

  function quote(evaluation) {
    var nights = state.nights;
    var perNight = state.rate.perNight;
    var charter = perNight * nights;
    var fee = evaluation && evaluation.status === "reposition" ? evaluation.fee : 0;
    return { perNight: perNight, nights: nights, charter: charter, fee: fee, total: charter + fee };
  }

  /* ---- rendering ------------------------------------------------ */

  var el = {
    banner: document.querySelector("[data-source-banner]"),
    date: document.querySelector("[data-date]"),
    nights: document.querySelector("[data-nights]"),
    directions: document.querySelector("[data-directions]"),
    calendar: document.querySelector("[data-calendar]"),
    monthLabel: document.querySelector("[data-month-label]"),
    monthPrev: document.querySelector("[data-month-prev]"),
    monthNext: document.querySelector("[data-month-next]"),
    partnerForm: document.querySelector("[data-partner-form]"),
    partnerState: document.querySelector("[data-partner-state]"),
    requestForm: document.querySelector("[data-request-form]"),
    receipt: document.querySelector("[data-request-receipt]"),
    summary: {
      title: document.querySelector("[data-summary-title]"),
      date: document.querySelector("[data-summary-date]"),
      nights: document.querySelector("[data-summary-nights]"),
      direction: document.querySelector("[data-summary-direction]"),
      rate: document.querySelector("[data-summary-rate]"),
      repositionRow: document.querySelector("[data-summary-reposition-row]"),
      reposition: document.querySelector("[data-summary-reposition]"),
      total: document.querySelector("[data-summary-total]"),
      flag: document.querySelector("[data-summary-flag]"),
      cta: document.querySelector("[data-summary-cta]"),
    },
  };

  function renderControls() {
    var nights = "";
    for (var n = config.nights.min; n <= config.nights.max; n++) {
      nights +=
        '<button type="button" data-night="' +
        n +
        '" aria-pressed="' +
        (n === state.nights) +
        '">' +
        n +
        "</button>";
    }
    el.nights.innerHTML = nights;

    el.directions.innerHTML = directions
      .map(function (direction) {
        return (
          '<button type="button" data-direction="' +
          direction.id +
          '" aria-pressed="' +
          (direction.id === state.direction) +
          '">' +
          direction.label +
          "</button>"
        );
      })
      .join("");
  }

  function renderCalendar() {
    var month = state.month;
    el.monthLabel.textContent = MONTH_LABEL.format(month);

    var thisMonth = startOfMonth(new Date());
    el.monthPrev.disabled = month <= thisMonth;

    // Monday-first grid
    var lead = (month.getDay() + 6) % 7;
    var length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

    var html = "";
    for (var pad = 0; pad < lead; pad++) html += '<div class="day day--pad"></div>';

    for (var day = 1; day <= length; day++) {
      var date = new Date(month.getFullYear(), month.getMonth(), day);
      var result = evaluateDay(date, state.nights);
      var selected = state.date && daysBetween(state.date, date) === 0;
      var inRange =
        state.date &&
        date > state.date &&
        daysBetween(state.date, date) <= state.nights &&
        !selected;

      var classes = ["day"];
      var tag = "";

      if (result.status === "unavailable") {
        classes.push("day--unavailable");
      } else if (result.status === "restricted") {
        classes.push("day--restricted");
        tag = "Restricted";
      } else {
        classes.push("day--available");
        if (result.status === "reposition") tag = "Reposition";
      }

      if (selected) classes.push("day--selected");
      if (inRange) classes.push("day--inrange");

      html +=
        '<button type="button" class="' +
        classes.join(" ") +
        '" data-day="' +
        planyo.iso(date) +
        '"' +
        (result.status === "unavailable" ? " disabled" : "") +
        ' title="' +
        (result.reason || "Available").replace(/"/g, "&quot;") +
        '">' +
        "<span>" +
        day +
        "</span>" +
        (result.status === "unavailable" ? "" : '<i class="day__dot"></i>') +
        (tag ? '<span class="day__tag">' + tag + "</span>" : "") +
        "</button>";
    }

    el.calendar.innerHTML = html;
  }

  function renderSummary() {
    var summary = el.summary;

    if (!state.date) {
      summary.title.textContent = "Choose a departure";
      ["date", "nights", "direction", "rate", "total"].forEach(function (key) {
        summary[key].innerHTML = "&mdash;";
      });
      summary.repositionRow.hidden = true;
      summary.flag.hidden = true;
      summary.cta.setAttribute("aria-disabled", "true");
      return;
    }

    var result = evaluate(state.date, state.nights, state.direction);
    var money = quote(result);
    var direction = directionsById[state.direction];
    var end = addDays(state.date, state.nights);

    summary.title.textContent = direction.label;
    summary.date.innerHTML =
      LONG_DATE.format(state.date) + "<small>Disembark " + LONG_DATE.format(end) + "</small>";
    summary.nights.textContent = state.nights + (state.nights === 1 ? " night" : " nights");
    summary.direction.textContent = direction.label;
    summary.rate.innerHTML =
      MONEY.format(money.charter) +
      "<small>" +
      MONEY.format(money.perNight) +
      " / night &middot; " +
      state.rate.tier +
      "</small>";

    summary.repositionRow.hidden = !money.fee;
    if (money.fee) summary.reposition.textContent = MONEY.format(money.fee);

    summary.total.textContent = MONEY.format(money.total);

    if (result.status === "restricted" || result.status === "unavailable") {
      summary.flag.hidden = false;
      summary.flag.className = "summary__flag";
      summary.flag.textContent = result.reason;
      summary.cta.setAttribute("aria-disabled", "true");
    } else if (result.status === "reposition") {
      summary.flag.hidden = false;
      summary.flag.className = "summary__flag summary__flag--river";
      summary.flag.textContent = result.reason + " " + config.repositioning.note;
      summary.cta.removeAttribute("aria-disabled");
    } else {
      summary.flag.hidden = true;
      summary.cta.removeAttribute("aria-disabled");
    }
  }

  function render() {
    renderCalendar();
    renderSummary();
  }

  /* ---- events ---------------------------------------------------- */

  function selectDate(date) {
    state.date = startOfDay(date);
    el.date.value = planyo.iso(state.date);
    if (
      state.date.getMonth() !== state.month.getMonth() ||
      state.date.getFullYear() !== state.month.getFullYear()
    ) {
      state.month = startOfMonth(state.date);
    }
    render();
  }

  el.nights.addEventListener("click", function (event) {
    var button = event.target.closest("[data-night]");
    if (!button) return;
    state.nights = Number(button.dataset.night);
    renderControls();
    render();
  });

  el.directions.addEventListener("click", function (event) {
    var button = event.target.closest("[data-direction]");
    if (!button) return;
    state.direction = button.dataset.direction;
    renderControls();
    render();
  });

  el.calendar.addEventListener("click", function (event) {
    var button = event.target.closest("[data-day]");
    if (!button || button.disabled) return;
    selectDate(planyo.parseIso(button.dataset.day));
  });

  el.date.addEventListener("change", function () {
    if (!el.date.value) return;
    selectDate(planyo.parseIso(el.date.value));
  });

  el.monthPrev.addEventListener("click", function () {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    render();
  });

  el.monthNext.addEventListener("click", function () {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    render();
  });

  /* ---- partner identity -------------------------------------------
     A partner code selects a rate tier. Real agent identity will
     come from a Planyo login or voucher code; the shape of the
     interface does not change when it does. */

  var STORAGE_KEY = "sts.partner-code";

  function applyPartnerCode(code) {
    var match = config.rates.tiers.filter(function (tier) {
      return tier.code.toLowerCase() === String(code || "").trim().toLowerCase();
    })[0];

    if (!match) {
      state.rate = config.rates.default;
      localStorage.removeItem(STORAGE_KEY);
      el.partnerState.innerHTML = code
        ? "We do not recognise that code. Showing <b>published rates</b>."
        : "Showing published rates. Enter your partner code to see your trade rate.";
      render();
      return false;
    }

    state.rate = match;
    localStorage.setItem(STORAGE_KEY, match.code);
    el.partnerState.innerHTML =
      "Signed in as <b>" + match.agency + "</b>. Showing " + match.tier.toLowerCase() + " rates.";
    render();
    return true;
  }

  el.partnerForm.addEventListener("submit", function (event) {
    event.preventDefault();
    applyPartnerCode(new FormData(el.partnerForm).get("code"));
  });

  /* ---- request ------------------------------------------------------ */

  el.requestForm.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!state.date) {
      el.receipt.hidden = false;
      el.receipt.innerHTML = "<h3>Choose a departure first</h3><p>Pick a date in the calendar above.</p>";
      return;
    }

    var data = Object.fromEntries(new FormData(el.requestForm));
    var result = evaluate(state.date, state.nights, state.direction);
    var money = quote(result);
    var direction = directionsById[state.direction];

    var payload = {
      resource: config.planyo.resourceId || "razis",
      start_date: planyo.iso(state.date),
      end_date: planyo.iso(addDays(state.date, state.nights)),
      nights: state.nights,
      direction: direction.id,
      repositioning: money.fee ? { required: true, fee: money.fee } : { required: false },
      rate: { tier: state.rate.tier, per_night: money.perNight, currency: config.currency.code },
      total: money.total,
      agency: data.agency,
      consultant: data.consultant,
      email: data.email,
      guests: Number(data.guests || 0),
      notes: data.notes || "",
    };

    el.receipt.hidden = false;
    el.receipt.innerHTML =
      "<h3>Request prepared</h3>" +
      "<p>" +
      direction.label +
      ", " +
      LONG_DATE.format(state.date) +
      ", " +
      state.nights +
      " nights, " +
      MONEY.format(money.total) +
      (money.fee ? " including repositioning." : ".") +
      "</p>" +
      "<p>This is the payload the portal will hand to Planyo once " +
      "<code>make_reservation</code> is enabled on the API key. Until then, send it to the office.</p>" +
      "<pre>" +
      JSON.stringify(payload, null, 2) +
      "</pre>";

    el.receipt.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  /* ---- boot ---------------------------------------------------------- */

  function showSource(schedule) {
    if (!el.banner) return;
    el.banner.hidden = false;

    if (schedule.source === "planyo") {
      el.banner.className = "source-banner source-banner--live";
      el.banner.innerHTML = "<b>Live</b> Availability is coming from Planyo.";
      return;
    }

    el.banner.className = "source-banner";
    el.banner.innerHTML =
      "<b>Sample data</b> Planyo is not connected in this environment, so the calendar is running on " +
      "<code>data/schedule.sample.json</code>. Set <code>PLANYO_API_KEY</code> to switch to live availability." +
      (schedule.error ? " (" + schedule.error + ")" : "");
  }

  renderControls();

  var windowStart = addDays(new Date(), -30);
  var windowEnd = addDays(new Date(), 400);

  planyo
    .getSchedule(windowStart, windowEnd)
    .then(function (schedule) {
      state.schedule = schedule;
      state.source = schedule.source;
      showSource(schedule);

      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) applyPartnerCode(saved);

      /* Open on the first month that has something to sell. */
      var cursor = startOfMonth(new Date());
      for (var i = 0; i < 12; i++) {
        var length = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        var sellable = false;
        for (var day = 1; day <= length && !sellable; day++) {
          var status = evaluateDay(new Date(cursor.getFullYear(), cursor.getMonth(), day), state.nights).status;
          sellable = status === "available" || status === "reposition";
        }
        if (sellable) break;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      state.month = cursor;

      render();
    })
    .catch(function (error) {
      console.error(error);
      if (el.banner) {
        el.banner.hidden = false;
        el.banner.className = "source-banner";
        el.banner.innerHTML = "<b>Unavailable</b> The schedule could not be loaded: " + error.message;
      }
    });
})();
