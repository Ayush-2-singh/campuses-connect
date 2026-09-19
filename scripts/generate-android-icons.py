#!/usr/bin/env python3
"""
Generate the Android launcher icons and splash screens from the existing
CampusConnect brand icon.

Source of truth: public/icon-512.png — the same asset the PWA manifest uses, so
the installed app and the launcher icon can never drift apart. Nothing is
invented here; the gold badge is extracted from that file and re-composited.

Why a script instead of committed binaries only: the outputs are derived, so
regenerating must be one command rather than a manual GIMP session. Re-running
is safe and idempotent.

Requirements: Python 3 + Pillow  (`pip install Pillow`)

Usage (from the repo root):
    python3 scripts/generate-android-icons.py

Outputs
    android/app/src/main/res/mipmap-*/ic_launcher.png            legacy square icon
    android/app/src/main/res/mipmap-*/ic_launcher_round.png      legacy round icon
    android/app/src/main/res/mipmap-*/ic_launcher_foreground.png adaptive foreground
    android/app/src/main/res/drawable*/splash.png                branded splash
    android/app/src/main/res/values/ic_launcher_background.xml   adaptive background

Note: the Android template's originals are regenerable with `npx cap add android`,
so overwriting them in place is safe.
"""

from pathlib import Path

from PIL import Image, ImageDraw

# ── Brand constants (must match src/theme/colors.ts PALETTE) ──────────────────
BRAND_BG = (15, 17, 21)      # #0F1115 — the app shell background
BRAND_BG_HEX = "#0F1115"
# The gold mark (#E9B853) inside the source icon is located by luminance below,
# not by this constant — it is kept as the palette reference.

REPO = Path(__file__).resolve().parent.parent
SOURCE = REPO / "public" / "icon-512.png"
RES = REPO / "android" / "app" / "src" / "main" / "res"

# Density bucket -> legacy launcher icon size in px (48dp at mdpi).
# The adaptive foreground uses the same bucket at 108dp.
LAUNCHER_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# Existing splash canvas sizes, so we replace like-for-like.
SPLASH_SIZES = {
    "drawable/splash.png": (480, 320),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
}

# The badge occupies ~58.6% of the canvas, and the adaptive-icon safe zone keeps
# the centre 66/108 = 61.1%. The mark therefore survives every launcher mask
# (circle, squircle, rounded square) without being clipped — which is why the
# full-bleed icon can be used directly as the adaptive foreground.
BADGE_BRIGHTNESS = 110      # luminance threshold that isolates the gold mark
BADGE_PADDING = 0.04        # extra breathing room when cropping, as a fraction
SPLASH_LOGO_RATIO = 0.28    # logo size as a fraction of the splash short edge


def find_badge_box(img: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of the bright (gold) mark, expanded to a centred square."""
    w, h = img.size
    px = img.load()
    minx, miny, maxx, maxy = w, h, -1, -1

    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if 0.299 * r + 0.587 * g + 0.114 * b > BADGE_BRIGHTNESS:
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)

    if maxx < 0:
        raise SystemExit("Could not find the logo mark in the source icon.")

    # Square the box around the canvas centre so the mark stays optically centred.
    side = int(max(maxx - minx, maxy - miny) * (1 + 2 * BADGE_PADDING))
    cx, cy = (minx + maxx) // 2, (miny + maxy) // 2
    left, top = cx - side // 2, cy - side // 2
    return (
        max(0, min(left, w)),
        max(0, min(top, h)),
        max(0, min(left + side, w)),
        max(0, min(top + side, h)),
    )


def circle_mask(size: int) -> Image.Image:
    """Anti-aliased circular alpha mask, drawn 4x then downsampled."""
    scale = 4
    big = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * scale - 1, size * scale - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    icon = Image.open(SOURCE).convert("RGBA")
    print(f"Source: {SOURCE.relative_to(REPO)}  {icon.size[0]}x{icon.size[1]}")

    badge_box = find_badge_box(icon)
    badge = icon.crop(badge_box)
    print(f"Badge crop: {badge_box} -> {badge.size[0]}x{badge.size[1]} (from the bright-pixel bbox)")

    written = 0

    for density, size in LAUNCHER_SIZES.items():
        out_dir = RES / f"mipmap-{density}"
        out_dir.mkdir(parents=True, exist_ok=True)

        # Legacy square icon — the full-bleed artwork, as published in the PWA.
        resize(icon, size).save(out_dir / "ic_launcher.png", optimize=True)
        written += 1

        # Legacy round icon — masked to a circle, corners transparent (AOSP style).
        round_icon = resize(icon, size)
        round_icon.putalpha(circle_mask(size))
        round_icon.save(out_dir / "ic_launcher_round.png", optimize=True)
        written += 1

        # Adaptive foreground — full bleed; the launcher applies the mask.
        # The dark surround matches ic_launcher_background, so edges blend.
        resize(icon, int(size * 108 / 48)).save(out_dir / "ic_launcher_foreground.png", optimize=True)
        written += 1

    for rel, (w, h) in SPLASH_SIZES.items():
        path = RES / rel
        path.parent.mkdir(parents=True, exist_ok=True)

        canvas = Image.new("RGB", (w, h), BRAND_BG)
        logo_side = max(96, int(min(w, h) * SPLASH_LOGO_RATIO))
        logo = badge.resize((logo_side, logo_side), Image.LANCZOS)
        canvas.paste(logo, ((w - logo_side) // 2, (h - logo_side) // 2), logo)
        canvas.save(path, optimize=True)
        written += 1

    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{BRAND_BG_HEX}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    written += 1

    print(f"\nWrote {written} files into {(RES).relative_to(REPO)}")
    print(f"Launcher densities: {', '.join(LAUNCHER_SIZES)}")
    print(f"Splash variants:    {len(SPLASH_SIZES)}")


if __name__ == "__main__":
    main()
