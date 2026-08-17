/* =============================================================
   THE NILE
   -------------------------------------------------------------
   The watercolour is a single 456 x 900 painting. To carry it
   down a page that is thousands of pixels tall without either
   stretching it or turning it into obvious wallpaper, it is laid
   out as a column of tiles that:

     - keep the painting's natural aspect ratio, always;
     - alternate a vertical mirror, so the last row of pixels in
       one tile is the first row of the next and the meander
       continues instead of jumping;
     - overlap by exactly the mask fade, so neighbours
       cross-dissolve rather than butt against each other.

   The first tile fades in below the navigation and the last
   fades out where the story resolves, which is why the river
   appears to begin and end rather than being cropped.
   ============================================================= */

(function () {
  "use strict";

  var river = document.querySelector("[data-river]");
  var flow = document.querySelector("[data-river-flow]");
  var boat = document.querySelector("[data-river-boat]");
  if (!river || !flow) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function readRatio(value, fallback) {
    var parts = String(value).split("/");
    var w = parseFloat(parts[0]);
    var h = parseFloat(parts[1]);
    return w && h ? w / h : fallback;
  }

  var state = { top: 0, height: 0, travel: 0 };

  function build() {
    var styles = getComputedStyle(river);
    var aspect = readRatio(styles.getPropertyValue("--river-ar"), 456 / 900);
    var fade = parseFloat(styles.getPropertyValue("--fade")) / 100 || 0.13;

    var width = river.clientWidth;
    var height = river.clientHeight;
    if (!width || !height) return;

    var tileHeight = width / aspect;
    var step = tileHeight * (1 - fade); // neighbours share the fade band
    var count = Math.max(2, Math.ceil((height - tileHeight) / step) + 1);

    var markup = "";
    for (var i = 0; i < count; i++) {
      markup +=
        '<div class="river__tile' +
        (i % 2 ? " river__tile--flip" : "") +
        '" style="top:' +
        Math.round(i * step) +
        'px"></div>';
    }
    flow.innerHTML = markup;
  }

  /* ---- the dahabiya drifting downstream ---------------------
     The boat is pinned to the river track and travels its whole
     length across the scroll, so it reads as moving with the
     current rather than as a parallax gimmick. */

  function measure() {
    if (!boat) return;
    var box = river.getBoundingClientRect();
    var pageTop = box.top + window.scrollY;
    state.top = pageTop;
    state.height = box.height;
    state.travel = Math.max(0, box.height - boat.offsetHeight);
  }

  var ticking = false;

  function place() {
    ticking = false;
    if (!boat || !state.travel) return;

    // 0 at the moment the river's head reaches the viewport
    // centre, 1 when its tail does
    var focus = window.scrollY + window.innerHeight * 0.5;
    var span = state.height;
    var progress = (focus - state.top) / span;
    progress = Math.min(1, Math.max(0, progress));

    var y = progress * state.travel;
    var sway = Math.sin(progress * Math.PI * 3) * 6;
    var tilt = Math.sin(progress * Math.PI * 3 + 1) * 1.2;

    boat.style.transform =
      "translate3d(calc(-50% + " +
      sway.toFixed(2) +
      "px)," +
      y.toFixed(1) +
      "px,0) rotate(" +
      tilt.toFixed(2) +
      "deg)";
    boat.style.opacity = (0.12 + 0.34 * Math.sin(Math.PI * progress)).toFixed(3);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(place);
  }

  function refresh() {
    build();
    measure();
    place();
  }

  refresh();

  if (!reduceMotion.matches) {
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 120);
  });

  // the collage images settle the page height as they decode
  window.addEventListener("load", refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
})();
