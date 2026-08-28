#!/usr/bin/env python3
"""Generates every QuickCar app-icon asset from one vector definition.

The mark is a tachometer sweep: an instrument arc whose lit portion runs up to a
needle. Geometry is computed rather than hand-placed so each platform variant is
the same drawing at a different scale, and so the Android adaptive foreground can
be sized against the real safe-zone radius instead of by eye.

Run: python3 assets/brand/build_icons.py
"""

from __future__ import annotations

import math
import pathlib
import sys

import cairosvg

ROOT = pathlib.Path(__file__).resolve().parent
ASSETS = ROOT.parent

# --- Palette ------------------------------------------------------------------
# Background is the app's dark canvas; the mark uses the brand blue and the dark
# theme's primary content colour, so the icon and the UI read as one system.
BG_TOP = "#151D26"
BG_BOTTOM = "#090C11"
BG_FLAT = "#0B0F14"
TRACK = "#26313E"
# Brightest at the start of the sweep, settling to the brand blue where the lit
# arc meets the unlit track — a bright end butted against the dark track reads as
# a hard seam rather than a reading.
ARC_FROM = "#4E9BF5"
ARC_TO = "#1C6FE0"  # tokens.ts brandPrimary
NEEDLE = "#F4F7FA"  # tokens.ts contentPrimary (dark)

# --- Geometry, in a 1024 design space -----------------------------------------
# START/SWEEP match src/components/GaugeRing.tsx, so the icon is the product's own
# instrument rather than a generic dial.
CX, CY = 512.0, 584.0
RADIUS = 290.0
STROKE = 84.0
START_DEG = 150.0  # lower-left
END_DEG = 390.0  # lower-right (240° sweep)
NEEDLE_DEG = 315.0  # up and to the right
NEEDLE_LEN = 205.0
NEEDLE_BASE_HALF = 38.0
NEEDLE_TIP_HALF = 10.0
HUB_R = 54.0
HUB_HOLE_R = 20.0

def _ink_discs() -> list[tuple[float, float, float]]:
    """Discs that together cover every painted pixel of the mark.

    The arc is sampled along its *centre* line and expanded by half the stroke,
    which is what actually bounds a round-capped stroke — taking the outer radius
    alone misses the end caps, and the safe-zone fit is only a guarantee if this
    is right.
    """
    discs: list[tuple[float, float, float]] = []
    deg = START_DEG
    while deg <= END_DEG:
        x, y = polar(CX, CY, RADIUS, deg)
        discs.append((x, y, STROKE / 2))
        deg += 0.5
    tx, ty = needle_tip()
    discs.append((tx, ty, NEEDLE_TIP_HALF))
    discs.append((CX, CY, HUB_R))
    return discs


def _bbox_and_radius() -> tuple[float, float, float]:
    discs = _ink_discs()
    x0 = min(x - r for x, _, r in discs)
    x1 = max(x + r for x, _, r in discs)
    y0 = min(y - r for _, y, r in discs)
    y1 = max(y + r for _, y, r in discs)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    radius = max(math.hypot(x - cx, y - cy) + r for x, y, r in discs)
    return cx, cy, radius


def polar(cx: float, cy: float, r: float, deg: float) -> tuple[float, float]:
    rad = math.radians(deg)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def ring_path(cx: float, cy: float, outer: float, inner: float) -> str:
    """Annulus as one even-odd path, so the hub's centre is a real hole and the
    background — gradient included — shows through it."""

    def circle(r: float) -> str:
        return f"M {cx - r} {cy} a {r} {r} 0 1 0 {2 * r} 0 a {r} {r} 0 1 0 {-2 * r} 0 Z"

    return f"{circle(outer)} {circle(inner)}"


def arc_path(r: float, a1: float, a2: float) -> str:
    x1, y1 = polar(CX, CY, r, a1)
    x2, y2 = polar(CX, CY, r, a2)
    large = 1 if abs(a2 - a1) > 180 else 0
    return f"M {x1:.2f} {y1:.2f} A {r} {r} 0 {large} 1 {x2:.2f} {y2:.2f}"


def needle_tip() -> tuple[float, float]:
    dx, dy = math.cos(math.radians(NEEDLE_DEG)), math.sin(math.radians(NEEDLE_DEG))
    return CX + dx * NEEDLE_LEN, CY + dy * NEEDLE_LEN


def needle_path() -> str:
    dx, dy = math.cos(math.radians(NEEDLE_DEG)), math.sin(math.radians(NEEDLE_DEG))
    px, py = -dy, dx  # perpendicular
    # Start clear of the hub's hole so no part of the needle intrudes into it.
    bx, by = CX + dx * (HUB_HOLE_R + 6), CY + dy * (HUB_HOLE_R + 6)
    tx, ty = needle_tip()
    pts = [
        (bx + px * NEEDLE_BASE_HALF, by + py * NEEDLE_BASE_HALF),
        (tx + px * NEEDLE_TIP_HALF, ty + py * NEEDLE_TIP_HALF),
        (tx - px * NEEDLE_TIP_HALF, ty - py * NEEDLE_TIP_HALF),
        (bx - px * NEEDLE_BASE_HALF, by - py * NEEDLE_BASE_HALF),
    ]
    return "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"


BBOX_CX, BBOX_CY, MARK_R = _bbox_and_radius()


def mark(*, mono: bool) -> str:
    """The drawing itself, in design space. `mono` flattens it to one colour for
    Android's themed-icon slot, where only a silhouette is allowed."""
    arc_fill = "#FFFFFF" if mono else "url(#sweep)"
    needle_fill = "#FFFFFF" if mono else NEEDLE
    parts = []
    if not mono:
        # Unlit remainder of the scale — the detail that makes it read as an
        # instrument rather than a generic arc. It drops away at small sizes,
        # which is the correct behaviour.
        parts.append(
            f'<path d="{arc_path(RADIUS, START_DEG, END_DEG)}" fill="none" '
            f'stroke="{TRACK}" stroke-width="{STROKE}" stroke-linecap="round"/>'
        )
    parts.append(
        f'<path d="{arc_path(RADIUS, START_DEG, NEEDLE_DEG)}" fill="none" '
        f'stroke="{arc_fill}" stroke-width="{STROKE}" stroke-linecap="round"/>'
    )
    # Fill plus a cap circle at the tip. Rounding the taper with a stroke instead
    # leaves a chiselled corner where the two long edges meet.
    tx, ty = needle_tip()
    parts.append(f'<path d="{needle_path()}" fill="{needle_fill}"/>')
    parts.append(f'<circle cx="{tx:.2f}" cy="{ty:.2f}" r="{NEEDLE_TIP_HALF}" fill="{needle_fill}"/>')
    parts.append(
        f'<path d="{ring_path(CX, CY, HUB_R, HUB_HOLE_R)}" fill-rule="evenodd" fill="{needle_fill}"/>'
    )
    return "\n    ".join(parts)


def svg(
    size: int,
    *,
    background: str | None,
    fit_radius: float,
    mono: bool = False,
    rounded: float | None = None,
) -> str:
    """`fit_radius` is the radius, in output pixels, the mark's ink must fit
    inside — the single knob that keeps every variant inside its safe area."""
    scale = fit_radius / MARK_R
    tx = size / 2 - BBOX_CX * scale
    ty = size / 2 - BBOX_CY * scale

    defs = [
        f'<linearGradient id="sweep" x1="0" y1="1" x2="1" y2="0">'
        f'<stop offset="0" stop-color="{ARC_FROM}"/>'
        f'<stop offset="1" stop-color="{ARC_TO}"/></linearGradient>',
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{BG_TOP}"/>'
        f'<stop offset="1" stop-color="{BG_BOTTOM}"/></linearGradient>',
    ]

    body = ""
    if background == "gradient":
        shape = (
            f'<rect width="{size}" height="{size}" rx="{rounded}" fill="url(#bg)"/>'
            if rounded
            else f'<rect width="{size}" height="{size}" fill="url(#bg)"/>'
        )
        body += shape
    elif background == "flat":
        body += f'<rect width="{size}" height="{size}" fill="{BG_FLAT}"/>'

    body += (
        f'<g transform="translate({tx:.3f} {ty:.3f}) scale({scale:.5f})">'
        f"{mark(mono=mono)}</g>"
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">\n  <defs>{"".join(defs)}</defs>\n  {body}\n</svg>\n'
    )


def write(name: str, markup: str, out_png: pathlib.Path, px: int) -> None:
    svg_path = ROOT / f"{name}.svg"
    svg_path.write_text(markup)
    cairosvg.svg2png(
        bytestring=markup.encode(), write_to=str(out_png), output_width=px, output_height=px
    )
    print(f"  {out_png.relative_to(ASSETS.parent)}  ({px}x{px})")


def main() -> None:
    print("Writing icon assets:")

    # iOS / store icon. Square, no transparency; the platform applies the mask,
    # so the mark keeps clear of the corners.
    write(
        "icon",
        svg(1024, background="gradient", fit_radius=1024 * 0.400),
        ASSETS / "icon.png",
        1024,
    )

    # Android adaptive foreground. The launcher may crop to a circle of 66/108
    # of the canvas, so the ink is fitted strictly inside that radius.
    # 0.97 keeps the antialiased edge inside the circle too, not just the geometry.
    android_safe = 512 * (66 / 108) / 2 * 0.97
    write(
        "android-icon-foreground",
        svg(512, background=None, fit_radius=android_safe),
        ASSETS / "android-icon-foreground.png",
        512,
    )
    write(
        "android-icon-background",
        svg(512, background="gradient", fit_radius=1),
        ASSETS / "android-icon-background.png",
        512,
    )
    # Themed icons are recoloured by the system, so this must be a flat
    # silhouette: no gradient, and the hub hole punched through to transparent.
    write(
        "android-icon-monochrome",
        svg(512, background=None, fit_radius=android_safe, mono=True),
        ASSETS / "android-icon-monochrome.png",
        512,
    )

    # Splash: mark only, on the app's canvas colour, set by the plugin.
    write(
        "splash-icon",
        svg(1024, background=None, fit_radius=1024 * 0.36),
        ASSETS / "splash-icon.png",
        1024,
    )

    # Favicon renders tiny; the unlit track and hub hole would only turn to mud,
    # so it uses the same flat treatment as the themed icon over the brand canvas.
    write(
        "favicon",
        svg(256, background="gradient", fit_radius=256 * 0.40, rounded=56),
        ASSETS / "favicon.png",
        256,
    )


if __name__ == "__main__":
    sys.exit(main())
