#!/usr/bin/env python3
"""Prepare the source artwork for the web.

The source PNGs in the project root are large exports with a lot of empty
transparent padding around the artwork. That padding is the reason earlier
layout work turned into pixel-by-pixel guesswork: the box you position in CSS
is not the box you see on screen.

This script writes a derivative of every source asset into `assets/` where the
image box *is* the artwork box, so a CSS `left`/`top`/`width` maps directly to
what an art director measures on the composition. It also downsizes and
re-encodes, which takes the page from ~17 MB of imagery to a couple of hundred
kilobytes.

Run it whenever the artwork in the project root changes:

    python3 tools/build-assets.py

Requires Pillow (`pip install pillow`).
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"

# alpha below this is treated as empty padding rather than artwork
ALPHA_FLOOR = 8

QUALITY = 86

# longest edge of the exported file, chosen as roughly 2x the largest size the
# asset is ever displayed at so it stays crisp on retina screens. `square`
# forces a torn-paper circle back to a true circle -- the scans are a couple of
# percent wider than they are tall, which reads as an oval at 200px+.
TARGETS = {
    "nile-watercolor.png": {"longest": 900},
    "dehabiya-main.png": {"longest": 900},
    "dehabiya-water.png": {"longest": 1100},
    "dehabiya-sketch.png": {"longest": 560},
    "date-palms-sketch.png": {"longest": 700},
    "temple-ruins.png": {"longest": 760},
    "nile-bird.png": {"longest": 640},
    "terracotta-circle.png": {"longest": 620, "square": True},
    "blue-paper-circle.png": {"longest": 620, "square": True},
}


def trim(im: Image.Image) -> Image.Image:
    alpha = im.getchannel("A")
    mask = alpha.point(lambda p: 255 if p > ALPHA_FLOOR else 0)
    box = mask.getbbox()
    return im.crop(box) if box else im


def build() -> None:
    OUT.mkdir(exist_ok=True)
    manifest = {}

    for name, opts in sorted(TARGETS.items()):
        src = ROOT / name
        if not src.exists():
            print(f"  skip {name} (missing)")
            continue

        im = trim(Image.open(src).convert("RGBA"))
        longest = opts["longest"]

        if opts.get("square"):
            size = (longest, longest)
        else:
            scale = min(1.0, longest / max(im.size))
            size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))

        if size != im.size:
            im = im.resize(size, Image.LANCZOS)

        out_name = Path(name).with_suffix(".webp").name
        dst = OUT / out_name
        im.save(dst, "WEBP", quality=QUALITY, method=6, exact=False)

        manifest[out_name] = {
            "source": name,
            "width": im.width,
            "height": im.height,
            "aspect": round(im.width / im.height, 4),
        }
        print(
            f"  {out_name:24s} {im.width:4d}x{im.height:<4d} "
            f"aspect {manifest[out_name]['aspect']:<6} "
            f"{src.stat().st_size / 1024:7.0f}kB -> {dst.stat().st_size / 1024:6.0f}kB"
        )

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\nwrote {len(manifest)} assets + manifest.json to {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    build()
