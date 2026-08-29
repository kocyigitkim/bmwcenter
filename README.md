# QuickCar

Android vehicle companion app. Reads the car's own data over a Bluetooth
OBD-II adapter: live sensors, fuel use, trip recording, trouble codes, and
maintenance tracking.

Built with React Native (Expo SDK 57). The app lives entirely in `mobile/`.

## Features

- Live OBD-II metrics over a BLE ELM327 adapter, with a mock adapter for
  development
- Automatic trip recording with route, per-second sensor history, and driving
  analysis (harsh events, traffic waits, fuel hotspots)
- Fuel tracking, refuel log, and live fuel prices
- Diagnostics: stored / pending / permanent trouble codes, real freeze frames,
  emissions monitor readiness, and a per-trip diagnostic timeline
- Vehicle health score, maintenance reminders driven by odometer and date, and
  a one-page mechanic report as PDF
- Multi-vehicle garage, route comparison and weekly trends
- Home-screen widget and a quick settings tile
- Full backup and restore to a single file
- Turkish and English

## Develop

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

`--legacy-peer-deps` is needed because react-dom's peer requirement conflicts
with the pinned React version.

Checks before pushing:

```bash
cd mobile
npx tsc --noEmit
npx jest
```

## Build an APK

Pushing to a branch runs `.github/workflows/mobile-android-build.yml`, which
prebuilds the native project, builds a signed release APK and publishes it as a
GitHub Release asset.

Signing comes from repository secrets — `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. They
are never committed.

To build locally you need the Android SDK:

```bash
cd mobile
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

`mobile/android/` is generated and gitignored, so anything native is injected at
prebuild time by the config plugins in `mobile/plugins/`.

## Repository layout

| Path | What it is |
| --- | --- |
| `mobile/` | The app |
| `mobile/src/core/` | Logic, organised by domain — OBD, trip, fuel, care, health, storage |
| `mobile/plugins/` | Expo config plugins for the native pieces (foreground service, widget) |
| `docs/` | PRD and reference notes |
| `scripts/` | One-off Python tools that regenerate the bundled DTC catalog and vehicle profile pack |
| `design/` | Branding assets |

## History

This started as a Swift/SwiftUI iOS app with CarPlay support. It was rewritten
in React Native and the Swift sources were removed once the port was complete;
`docs/ios-native-surfaces.md` records the parts that were never ported (CarPlay,
Apple Watch, iOS widgets) and how to recover them from git history.
