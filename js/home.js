/* =============================================================
   HOMEPAGE BEHAVIOUR
     1. when About reaches the viewport, the fixed pane and the
        river step aside so they do not overlay the full-width
        page
     2. a measurement overlay for art-directing the collages
        (press "g", or load the page with ?grid)
   ============================================================= */

(function () {
  "use strict";

  /* ---- off-river -------------------------------------------- */

  var about = document.getElementById("about");

  if (about && "IntersectionObserver" in window) {
    var offRiver = new IntersectionObserver(
      function (entries) {
        var entry = entries[0];
        document.body.classList.toggle(
          "is-off-river",
          entry.isIntersecting && entry.intersectionRatio > 0.04
        );
      },
      { threshold: [0, 0.04, 0.12, 0.28, 0.5] }
    );
    offRiver.observe(about);
  }

  /* ---- measurement overlay -----------------------------------
     The composition is defined by a handful of numbers in
     css/home.css. This draws them, so a change can be checked
     against the real page instead of guessed at. */

  var overlay = null;

  function px(value) {
    return Math.round(value) + "px";
  }

  function readVar(name) {
    var probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;width:var(" + name + ")";
    document.body.appendChild(probe);
    var value = probe.getBoundingClientRect().width;
    probe.remove();
    return value;
  }

  function buildOverlay() {
    var stage = document.querySelector(".river-stage");
    if (!stage) return;

    var el = document.createElement("div");
    el.className = "grid-overlay";
    el.setAttribute("aria-hidden", "true");

    var seam = readVar("--seam");
    var riverW = readVar("--river-w");
    var stageX = readVar("--stage-x");
    var stageW = readVar("--stage-w");
    var bank = seam - riverW / 2;

    function line(x, label, tone) {
      return (
        '<i class="grid-overlay__v" style="left:' +
        px(x) +
        ";--tone:" +
        tone +
        '"><em>' +
        label +
        " " +
        px(x) +
        "</em></i>"
      );
    }

    var html =
      line(stageX, "stage x", "var(--rust)") +
      line(stageX + stageW, "stage w " + px(stageW) + " \u2192", "var(--rust)") +
      line(bank, "left bank", "var(--river)") +
      line(seam, "seam", "var(--ink)") +
      line(bank + riverW, "right bank", "var(--river)");

    document.querySelectorAll(".scene").forEach(function (scene) {
      var box = scene.getBoundingClientRect();
      var art = scene.querySelector(".scene__art");
      var top = box.top + window.scrollY;
      html +=
        '<i class="grid-overlay__box" style="left:' +
        px(box.left) +
        ";top:" +
        px(top) +
        ";width:" +
        px(box.width) +
        ";height:" +
        px(box.height) +
        '"><em>' +
        (scene.id || "closing") +
        " \u2014 " +
        px(box.width) +
        " \u00d7 " +
        px(art ? art.getBoundingClientRect().height : box.height) +
        "</em></i>";
    });

    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  function toggleOverlay(force) {
    var wanted = force === undefined ? !overlay : force;
    if (!wanted) {
      if (overlay) overlay.remove();
      overlay = null;
      return;
    }
    if (overlay) overlay.remove();
    overlay = buildOverlay();
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "g" && event.key !== "G") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var tag = (event.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    toggleOverlay();
  });

  if (/[?&]grid\b/.test(window.location.search)) {
    window.addEventListener("load", function () {
      toggleOverlay(true);
    });
  }

  window.addEventListener("resize", function () {
    if (overlay) toggleOverlay(true);
  });
})();
