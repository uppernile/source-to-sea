/* =============================================================
   AGENT BOOKING PORTAL
   -------------------------------------------------------------
   Three inputs — date, nights, direction — resolved against the
   charters already on the books.

   Two operational rules shape what an agent may choose:

     1. Every route has a minimum length, because the sailing
        takes that long. Aswan–Esna needs three nights,
        Aswan–Luxor four.
     2. Guests never disembark and embark on the same day, so
        every booked charter blocks a day either side of itself.

   Both live in js/config.js. The schedule comes from Planyo (see
   js/planyo.js). This file only decides what can be sold.
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

  /* ---- what is in the way? ------------------------------------
     A charter blocks its own nights plus a turnaround day either
     side, so nobody disembarks and embarks on the same day.
     Returns a reason string, or null when the stay is clear. */

  function blockedBy(start, nights) {
    var schedule = state.schedule;
    if (!schedule) return "No schedule loaded.";

    var end = addDays(start, nights);
    var turnaround = config.turnaroundDays;

    var clash = schedule.charters.filter(function (charter) {
      return overlaps(
        start,
        end,
        addDays(charter.start, -turnaround),
        addDays(charter.end, turnaround)
      );
    })[0];

    if (clash) return "Razis is already chartered around these dates.";

    var closure = (schedule.closures || []).filter(function (period) {
      return overlaps(start, end, period.start, addDays(period.end, 1));
    })[0];

    return closure ? closure.reason || "The boat is out of service." : null;
  }

  /** The longest stay that would fit from this date, 0 if none. */
  function longestFrom(start) {
    for (var nights = config.nights.max; nights >= config.nights.min; nights--) {
      if (!blockedBy(start, nights)) return nights;
    }
    return 0;
  }

  var shortestRoute = Math.min.apply(
    null,
    directions.map(function (direction) {
      return direction.minNights;
    })
  );

  /* ---- can this departure be sold? ----------------------------
     Returns one of:
       available   — sail as asked
       restricted  — the date is sellable, but not this route at
                     this length
       unavailable — nothing at all can start here */

  function evaluate(date, nights, directionId) {
    var direction = directionsById[directionId];
    if (!state.schedule || !direction) {
      return { status: "unavailable", reason: "No schedule loaded." };
    }

    var start = startOfDay(date);
    if (start < startOfDay(new Date())) {
      return { status: "unavailable", reason: "In the past." };
    }

    var longest = longestFrom(start);

    if (longest < shortestRoute) {
      return { status: "unavailable", reason: blockedBy(start, shortestRoute) };
    }

    if (longest < direction.minNights) {
      return {
        status: "restricted",
        longest: longest,
        reason:
          "Only " +
          longest +
          " nights fit before the next charter, and " +
          direction.label +
          " needs at least " +
          direction.minNights +
          ".",
      };
    }

    if (nights > longest) {
      return {
        status: "restricted",
        longest: longest,
        reason:
          "Only " +
          longest +
          " nights fit before the next charter. Shorten the stay to depart on this date.",
      };
    }

    if (nights < direction.minNights) {
      return {
        status: "restricted",
        reason: direction.label + " needs at least " + direction.minNights + " nights.",
      };
    }

    return { status: "available" };
  }

  /* ---- money --------------------------------------------------- */

  function quote() {
    var charter = state.rate.perNight * state.nights;
    return { perNight: state.rate.perNight, nights: state.nights, total: charter };
  }

  /* ---- rendering ------------------------------------------------ */

  var el = {
    banner: document.querySelector("[data-source-banner]"),
    date: document.querySelector("[data-date]"),
    nights: document.querySelector("[data-nights]"),
    directions: document.querySelector("[data-directions]"),
    nightsNote: document.querySelector("[data-nights-note]"),
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
      total: document.querySelector("[data-summary-total]"),
      flag: document.querySelector("[data-summary-flag]"),
      cta: document.querySelector("[data-summary-cta]"),
    },
  };

  function minNights() {
    var direction = directionsById[state.direction];
    return direction ? direction.minNights : config.nights.min;
  }

  function renderControls() {
    var floor = minNights();
    var nights = "";

    for (var n = config.nights.min; n <= config.nights.max; n++) {
      var tooShort = n < floor;
      nights +=
        '<button type="button" data-night="' +
        n +
        '" aria-pressed="' +
        (n === state.nights) +
        '"' +
        (tooShort
          ? ' disabled title="' + directionsById[state.direction].label + " needs " + floor + ' nights"'
          : "") +
        ">" +
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

    el.nightsNote.textContent =
      directionsById[state.direction].label + " sails in " + floor + " nights or more.";
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
      var result = evaluate(date, state.nights, state.direction);
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
        tag = result.longest ? "Max " + result.longest : "Restricted";
      } else {
        classes.push("day--available");
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
      summary.flag.hidden = true;
      summary.cta.setAttribute("aria-disabled", "true");
      return;
    }

    var result = evaluate(state.date, state.nights, state.direction);
    var money = quote();
    var direction = directionsById[state.direction];
    var end = addDays(state.date, state.nights);

    summary.title.textContent = direction.label;
    summary.date.innerHTML =
      LONG_DATE.format(state.date) + "<small>Disembark " + LONG_DATE.format(end) + "</small>";
    summary.nights.textContent = state.nights + (state.nights === 1 ? " night" : " nights");
    summary.direction.textContent = direction.label;
    summary.rate.innerHTML =
      MONEY.format(money.total) +
      "<small>" +
      MONEY.format(money.perNight) +
      " / night &middot; " +
      state.rate.tier +
      "</small>";
    summary.total.textContent = MONEY.format(money.total);

    if (result.status === "available") {
      summary.flag.hidden = true;
      summary.cta.removeAttribute("aria-disabled");
    } else {
      summary.flag.hidden = false;
      summary.flag.className = "summary__flag";
      summary.flag.textContent = result.reason;
      summary.cta.setAttribute("aria-disabled", "true");
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
    // a longer route cannot be sold at the shorter route's length
    state.nights = Math.max(state.nights, minNights());
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

  function refuse(title, detail) {
    el.receipt.hidden = false;
    el.receipt.innerHTML = "<h3>" + title + "</h3><p>" + detail + "</p>";
    el.receipt.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  el.requestForm.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!state.date) {
      return refuse("Choose a departure first", "Pick a date in the calendar above.");
    }

    /* The summary already disables its own call to action, but the
       form has its own button and must not let an impossible
       departure through. */
    var check = evaluate(state.date, state.nights, state.direction);
    if (check.status !== "available") {
      return refuse("That departure cannot be booked", check.reason);
    }

    var data = Object.fromEntries(new FormData(el.requestForm));

    var missing = ["agency", "consultant", "email"].filter(function (field) {
      return !String(data[field] || "").trim();
    });

    if (missing.length) {
      return refuse(
        "A few details are missing",
        "Please fill in " + missing.join(", ") + " so the office can reply."
      );
    }

    var money = quote();
    var direction = directionsById[state.direction];

    var payload = {
      resource: config.planyo.resourceId || "razis",
      start_date: planyo.iso(state.date),
      end_date: planyo.iso(addDays(state.date, state.nights)),
      nights: state.nights,
      direction: direction.id,
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
      ".</p>" +
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

    if (schedule.source === "fallback") {
      el.banner.innerHTML =
        "<b>Planyo unreachable</b> The calendar has fallen back to " +
        "<code>data/schedule.sample.json</code>. Planyo said: " +
        (schedule.error || "no reason given") +
        ".";
      return;
    }

    el.banner.innerHTML =
      "<b>Sample data</b> Planyo is not connected in this environment, so the calendar is running on " +
      "<code>data/schedule.sample.json</code>. Set <code>PLANYO_API_KEY</code> to switch to live availability.";
  }

  renderControls();

  var windowStart = addDays(new Date(), -30);
  var windowEnd = addDays(new Date(), 400);

  planyo
    .getSchedule(windowStart, windowEnd)
    .then(function (schedule) {
      state.schedule = schedule;
      showSource(schedule);

      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) applyPartnerCode(saved);

      /* Open on the first month that has something to sell. */
      var cursor = startOfMonth(new Date());
      for (var i = 0; i < 12; i++) {
        var length = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        var sellable = false;
        for (var day = 1; day <= length && !sellable; day++) {
          var status = evaluate(
            new Date(cursor.getFullYear(), cursor.getMonth(), day),
            state.nights,
            state.direction
          ).status;
          sellable = status === "available";
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
