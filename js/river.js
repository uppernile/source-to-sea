/* =============================================================
   THE NILE
   -------------------------------------------------------------
   The watercolour is a single 456 x 900 painting. It is fixed
   to the viewport, so it is tiled only to the window height —
   never to the length of the page, and never in response to
   scroll. Tiles:

     - keep the painting's natural aspect ratio, always;
     - alternate a vertical mirror, so the last row of pixels in
       one tile is the first row of the next and the meander
       continues instead of jumping;
     - overlap by exactly the mask fade, so neighbours
       cross-dissolve rather than butt against each other.

   The first tile fades in below the navigation.
   ============================================================= */

(function () {
  "use strict";

  var river = document.querySelector("[data-river]");
  var flow = document.querySelector("[data-river-flow]");
  if (!river || !flow) return;

  function readRatio(value, fallback) {
    var parts = String(value).split("/");
    var w = parseFloat(parts[0]);
    var h = parseFloat(parts[1]);
    return w && h ? w / h : fallback;
  }

  function build() {
    var styles = getComputedStyle(river);
    var aspect = readRatio(styles.getPropertyValue("--river-ar"), 456 / 900);
    var fade = parseFloat(styles.getPropertyValue("--fade")) / 100 || 0.13;

    var width = river.clientWidth;
    var height = river.clientHeight;
    if (!width || !height) return;

    var tileHeight = width / aspect;
    var step = tileHeight * (1 - fade);
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

  build();

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 120);
  });

  window.addEventListener("load", build);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
})();
