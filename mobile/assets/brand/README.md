# QuickCar brand mark

The app icon is a tachometer sweep: the instrument arc from
`src/components/GaugeRing.tsx` (150° start, 240° sweep — the same numbers the
dashboard gauges use), lit up to a needle.

Everything in `assets/` is generated from `build_icons.py`. Edit the constants
there, never the PNGs, then regenerate:

```
pip install cairosvg
python3 assets/brand/build_icons.py
```

The `.svg` files next to the script are the rendered masters, written on each
run for reference and hand-off; they are outputs, not inputs.

## Why it is built rather than drawn

Each platform slot has a different safe area, and the Android adaptive
foreground is the strict one: a launcher may crop to a circle of 66/108 of the
canvas. The script measures the mark's real ink extent — sampling the arc's
centre line and expanding by half the stroke, which is what actually bounds a
round-capped stroke — and scales each variant against that. `fit_radius` is the
one knob per variant, so "fits the safe zone" is arithmetic rather than
judgement.

## Outputs

| File | Used by | Notes |
| --- | --- | --- |
| `icon.png` | iOS, stores | Opaque square; the platform applies its own mask. |
| `android-icon-foreground.png` | Android adaptive | Ink inside the 66/108 safe circle, with margin for antialiasing. |
| `android-icon-background.png` | Android adaptive | Background gradient only. |
| `android-icon-monochrome.png` | Android 13+ themed icons | Flat white silhouette; the system recolours it, so it must stay one colour. |
| `splash-icon.png` | `expo-splash-screen` | Mark only, on the canvas colour set in `app.json`. |
| `favicon.png` | Web | Rounded, since browsers render it unmasked. |

## Colours

Taken from `src/design/tokens.ts` so the icon and the UI stay one system:
brand blue `#1C6FE0`, dark canvas `#0B0F14`, content `#F4F7FA`.
