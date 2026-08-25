#!/usr/bin/env python3
"""QuickCar brand asset generator.

Renders the app icon (iOS light/dark/tinted, Android adaptive + legacy) and the
store banners from a single vector-ish description, so every asset stays in sync.

    python3 design/branding/generate_brand_assets.py

Output:
    QuickCar/Resources/Assets.xcassets/AppIcon.appiconset/*      (iOS, in-project)
    design/branding/android/res/**                               (drop into an Android module)
    design/branding/store/*                                      (App Store / Google Play art)
"""

import math
import os
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_IOS = os.path.join(ROOT, "QuickCar/Resources/Assets.xcassets/AppIcon.appiconset")
OUT_ANDROID = os.path.join(ROOT, "design/branding/android/res")
OUT_STORE = os.path.join(ROOT, "design/branding/store")

# ---------------------------------------------------------------- palette ----
# Derived from Assets.xcassets: accent/blue #0E63C4, bg/primary dark #0B0D10.
BG_TOP = (22, 48, 92)
BG_BOTTOM = (6, 10, 20)
GLOW = (30, 91, 255)
RING_START = (30, 107, 255)     # #1E6BFF
RING_END = (55, 216, 255)       # #37D8FF
NEEDLE_TOP = (255, 198, 77)     # #FFC64D
NEEDLE_BOTTOM = (255, 138, 31)  # #FF8A1F
INK = (240, 246, 255)
MUTED = (150, 170, 200)

SS = 4  # supersampling factor

FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"
FONT_BOLD, FONT_MEDIUM, FONT_REGULAR = 1, 10, 0


def font(size, index=FONT_BOLD):
    return ImageFont.truetype(FONT_PATH, size, index=index)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def linear_gradient(size, c0, c1, diagonal=True):
    """Vertical (or top-left -> bottom-right) gradient."""
    w, h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = ((x / max(w - 1, 1)) + (y / max(h - 1, 1))) / 2 if diagonal else y / max(h - 1, 1)
            px[x, y] = lerp(c0, c1, t)
    return img


def radial_glow(size, center, radius, color, peak_alpha):
    w, h = size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    steps = 48
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        a = int(peak_alpha * (1 - t) ** 2)
        d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=a)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.12))
    tint = Image.new("RGB", (w, h), color)
    return tint, layer


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


# ----------------------------------------------------------------- glyph -----
# The mark is a tachometer dial whose open sweep + needle reads as a "Q".
# Geometry is authored on a 1024x1024 box and scaled from there.
GLYPH_BOX = 1024.0
CENTER = (512.0, 512.0)
RING_R = 361.0        # centre-line radius of the ring stroke
RING_W = 118.0
ARC_START = 71.0      # degrees, PIL convention (0 = east, clockwise)
ARC_END = 379.0
NEEDLE_ANGLE = 45.0
NEEDLE_TIP_R = 474.0
NEEDLE_TAIL_R = -40.0
NEEDLE_BASE_HW = 44.0
NEEDLE_TIP_HW = 20.0
HUB_R = 92.0
HUB_CORE_R = 44.0


def draw_glyph(size, ring=(RING_START, RING_END), needle=(NEEDLE_TOP, NEEDLE_BOTTOM),
               hub_core=(11, 18, 32), scale=1.0, shadow=True):
    """Render the QuickCar mark as an RGBA image of `size` x `size`."""
    n = int(size * SS)
    k = (n / GLYPH_BOX) * scale
    off = (n - GLYPH_BOX * k) / 2.0

    def P(x, y):
        return (off + x * k, off + y * k)

    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Ring, drawn as short arc segments so the stroke can carry a gradient.
    cx, cy = P(*CENTER)
    r_out = (RING_R + RING_W / 2) * k
    r_in = (RING_R - RING_W / 2) * k
    w_px = int(round(r_out - r_in))
    r_cap = w_px / 2.0
    steps = 260
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        a0 = ARC_START + (ARC_END - ARC_START) * t0
        a1 = ARC_START + (ARC_END - ARC_START) * t1 + 0.35  # overlap hides joints
        col = lerp(ring[0], ring[1], t0)
        # PIL strokes inward from the bbox, so the bbox is the *outer* radius.
        d.arc([cx - r_out, cy - r_out, cx + r_out, cy + r_out],
              a0, a1, fill=col + (255,), width=w_px)
    # Round the two arc caps.
    for ang, t in ((ARC_START, 0.0), (ARC_END, 1.0)):
        r_mid = r_out - r_cap
        ax = cx + math.cos(math.radians(ang)) * r_mid
        ay = cy + math.sin(math.radians(ang)) * r_mid
        d.ellipse([ax - r_cap, ay - r_cap, ax + r_cap, ay + r_cap],
                  fill=lerp(ring[0], ring[1], t) + (255,))

    # Needle: tapered quad from behind the hub out through the dial gap.
    a = math.radians(NEEDLE_ANGLE)
    ux, uy = math.cos(a), math.sin(a)
    px, py = -uy, ux

    def pt(r, hw):
        return (cx + ux * r * k + px * hw * k, cy + uy * r * k + py * hw * k)

    quad = [pt(NEEDLE_TIP_R, NEEDLE_TIP_HW), pt(NEEDLE_TIP_R, -NEEDLE_TIP_HW),
            pt(NEEDLE_TAIL_R, -NEEDLE_BASE_HW), pt(NEEDLE_TAIL_R, NEEDLE_BASE_HW)]

    if shadow:
        sh = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        o = 10 * k
        sd.polygon([(x + o, y + o) for x, y in quad], fill=(0, 0, 0, 130))
        sh = sh.filter(ImageFilter.GaussianBlur(14 * k))
        img.alpha_composite(sh)
        d = ImageDraw.Draw(img)

    # Gradient fill for the needle, clipped to the quad.
    grad = Image.new("RGBA", (n, n))
    gp = grad.load()
    for y in range(n):
        c = lerp(needle[0], needle[1], y / max(n - 1, 1))
        for x in range(n):
            gp[x, y] = c + (255,)
    nmask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(nmask).polygon(quad, fill=255)
    # round the needle tip + tail
    nd = ImageDraw.Draw(nmask)
    for r, hw in ((NEEDLE_TIP_R, NEEDLE_TIP_HW), (NEEDLE_TAIL_R, NEEDLE_BASE_HW)):
        c0 = (cx + ux * r * k, cy + uy * r * k)
        rr = hw * k
        nd.ellipse([c0[0] - rr, c0[1] - rr, c0[0] + rr, c0[1] + rr], fill=255)
    img.paste(grad, (0, 0), nmask)

    # Hub.
    d = ImageDraw.Draw(img)
    hr, hc = HUB_R * k, HUB_CORE_R * k
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=needle[0] + (255,))
    d.ellipse([cx - hc, cy - hc, cx + hc, cy + hc], fill=hub_core + (255,))

    return img.resize((size, size), Image.LANCZOS)


def icon_background(size, rounded_radius=None):
    n = size
    bg = linear_gradient((n, n), BG_TOP, BG_BOTTOM).convert("RGBA")
    tint, mask = radial_glow((n, n), (n * 0.5, n * 0.42), n * 0.62, GLOW, 118)
    bg.paste(tint, (0, 0), mask)
    if rounded_radius is not None:
        out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        out.paste(bg, (0, 0), rounded_mask((n, n), rounded_radius))
        return out
    return bg


def compose_icon(size, glyph_scale=0.72, rounded_radius=None, **glyph_kw):
    bg = icon_background(size, rounded_radius)
    g = draw_glyph(size, scale=glyph_scale, **glyph_kw)
    bg.alpha_composite(g)
    return bg


# ------------------------------------------------------------------- iOS -----
def build_ios():
    os.makedirs(OUT_IOS, exist_ok=True)
    compose_icon(1024).convert("RGB").save(os.path.join(OUT_IOS, "AppIcon.png"))

    # Dark: transparent background, the system supplies its own dark material.
    dark = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    dark.alpha_composite(draw_glyph(1024, scale=0.72, hub_core=(9, 14, 26)))
    dark.save(os.path.join(OUT_IOS, "AppIcon-Dark.png"))

    # Tinted: monochrome, luminance drives the system tint.
    tinted = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    tinted.alpha_composite(draw_glyph(
        1024, scale=0.72,
        ring=((150, 150, 150), (225, 225, 225)),
        needle=((255, 255, 255), (235, 235, 235)),
        hub_core=(60, 60, 60), shadow=False))
    tinted.save(os.path.join(OUT_IOS, "AppIcon-Tinted.png"))

    with open(os.path.join(OUT_IOS, "Contents.json"), "w") as f:
        f.write(IOS_CONTENTS_JSON)


IOS_CONTENTS_JSON = """{
  "images" : [
    {
      "filename" : "AppIcon.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "filename" : "AppIcon-Dark.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "filename" : "AppIcon-Tinted.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
"""


# --------------------------------------------------------------- Android -----
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

ADAPTIVE_ICON_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
"""

COLORS_XML = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="quickcar_bg_top">#16305C</color>
    <color name="quickcar_bg_bottom">#060A14</color>
    <color name="quickcar_accent">#1E6BFF</color>
    <color name="quickcar_accent_alt">#37D8FF</color>
    <color name="quickcar_needle">#FFC64D</color>
</resources>
"""


def build_android():
    if os.path.isdir(OUT_ANDROID):
        shutil.rmtree(OUT_ANDROID)
    for d, mult in DENSITIES.items():
        os.makedirs(os.path.join(OUT_ANDROID, f"mipmap-{d}"), exist_ok=True)

        # Adaptive layers: 108dp canvas, glyph inside the 72dp safe zone.
        n = int(108 * mult)
        icon_background(n).convert("RGB").save(
            os.path.join(OUT_ANDROID, f"mipmap-{d}", "ic_launcher_background.png"))

        fg = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        fg.alpha_composite(draw_glyph(n, scale=0.50))
        fg.save(os.path.join(OUT_ANDROID, f"mipmap-{d}", "ic_launcher_foreground.png"))

        mono = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        mono.alpha_composite(draw_glyph(
            n, scale=0.50,
            ring=((255, 255, 255), (255, 255, 255)),
            needle=((255, 255, 255), (255, 255, 255)),
            hub_core=(0, 0, 0), shadow=False))
        mono.save(os.path.join(OUT_ANDROID, f"mipmap-{d}", "ic_launcher_monochrome.png"))

        # Legacy raster launcher icons (API < 26).
        legacy = int(48 * mult)
        compose_icon(legacy, glyph_scale=0.70,
                     rounded_radius=int(legacy * 0.22)).save(
            os.path.join(OUT_ANDROID, f"mipmap-{d}", "ic_launcher.png"))

        rnd = compose_icon(legacy, glyph_scale=0.68)
        circle = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(circle).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        out = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        out.paste(rnd, (0, 0), circle)
        out.save(os.path.join(OUT_ANDROID, f"mipmap-{d}", "ic_launcher_round.png"))

    os.makedirs(os.path.join(OUT_ANDROID, "mipmap-anydpi-v26"), exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(OUT_ANDROID, "mipmap-anydpi-v26", name), "w") as f:
            f.write(ADAPTIVE_ICON_XML)
    os.makedirs(os.path.join(OUT_ANDROID, "values"), exist_ok=True)
    with open(os.path.join(OUT_ANDROID, "values", "colors_quickcar.xml"), "w") as f:
        f.write(COLORS_XML)


# ----------------------------------------------------------------- store -----
def speed_streaks(img, count=7):
    """Faint diagonal motion lines behind the artwork."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(count):
        t = i / max(count - 1, 1)
        y = int(h * (0.10 + 0.80 * t))
        length = int(w * (0.20 + 0.35 * (1 - abs(t - 0.5) * 2)))
        x0 = int(w * 0.30 + w * 0.10 * t)
        alpha = int(26 + 34 * (1 - abs(t - 0.5) * 2))
        d.line([(x0, y), (x0 + length, y - int(length * 0.18))],
               fill=(90, 170, 255, alpha), width=max(2, h // 130))
    layer = layer.filter(ImageFilter.GaussianBlur(h / 180))
    img.alpha_composite(layer)


def banner(size, title, subtitle, bullets, glyph_frac=0.62, out=None):
    w, h = size
    img = linear_gradient((w, h), BG_TOP, BG_BOTTOM).convert("RGBA")
    tint, mask = radial_glow((w, h), (w * 0.22, h * 0.5), h * 1.05, GLOW, 120)
    img.paste(tint, (0, 0), mask)
    speed_streaks(img)

    g = int(h * glyph_frac)
    glyph = draw_glyph(g, scale=1.0)
    gx = int(w * 0.055)
    img.alpha_composite(glyph, (gx, (h - g) // 2))

    d = ImageDraw.Draw(img)
    tx = gx + g + int(w * 0.045)
    avail = w - tx - int(w * 0.055)

    def fit(text, px, index):
        """Largest size <= px whose rendered width still fits the text column."""
        f = font(px, index)
        while px > 10 and d.textlength(text, font=f) > avail:
            px -= 2
            f = font(px, index)
        return f

    f_title = fit(title, int(h * 0.155), FONT_BOLD)
    f_sub = fit(subtitle, int(h * 0.068), FONT_MEDIUM)
    f_bul = fit(max(bullets, key=len) + "•  ", int(h * 0.052), FONT_REGULAR)

    block_h = int(h * 0.155) + int(h * 0.075) + int(h * 0.068) + int(h * 0.05) + int(h * 0.062)
    y = (h - block_h) // 2
    d.text((tx, y), title, font=f_title, fill=INK)
    y += int(h * 0.185)
    d.text((tx, y), subtitle, font=f_sub, fill=(120, 190, 255))
    y += int(h * 0.115)
    for b in bullets:
        d.text((tx, y), "•  " + b, font=f_bul, fill=MUTED)
        y += int(h * 0.072)

    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.convert("RGB").save(out)


def build_store():
    os.makedirs(OUT_STORE, exist_ok=True)
    # App Store icon (1024, no alpha, no rounding — Apple masks it).
    compose_icon(1024).convert("RGB").save(os.path.join(OUT_STORE, "appstore_icon_1024.png"))
    # Google Play store listing icon (512, 32-bit PNG, full bleed).
    compose_icon(512).convert("RGB").save(os.path.join(OUT_STORE, "play_icon_512.png"))

    banner((1024, 500), "QuickCar",
           "Aracının canlı verileri, cebinde",
           ["Canlı OBD-II göstergeleri", "Otomatik yolculuk kaydı", "Yakıt takibi", "CarPlay desteği"],
           out=os.path.join(OUT_STORE, "play_feature_graphic_1024x500.png"))

    banner((1200, 630), "QuickCar",
           "Live OBD-II · Trips · Fuel · CarPlay",
           ["Real-time engine metrics", "Automatic trip logging",
            "Fuel & cost tracking", "Fault code scanner"],
           glyph_frac=0.56,
           out=os.path.join(OUT_STORE, "marketing_banner_1200x630.png"))

    banner((1280, 720), "QuickCar",
           "Aracının canlı verileri, cebinde",
           ["Canlı OBD-II göstergeleri", "Otomatik yolculuk kaydı",
            "Yakıt ve maliyet takibi", "Arıza kodu tarayıcı"],
           glyph_frac=0.52,
           out=os.path.join(OUT_STORE, "play_tv_banner_1280x720.png"))


if __name__ == "__main__":
    build_ios()
    build_android()
    build_store()
    print("brand assets regenerated")
