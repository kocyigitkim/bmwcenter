# QuickCar

iOS 17+ vehicle companion app with CarPlay Driving Task support.

## Features

- Live OBD-II metrics (BLE ELM327 + mock adapter for Simulator)
- Auto trip recording with SwiftData
- Fuel tracking and refuel log
- CarPlay tabs: Live / Trip / Fuel / History
- Phone tabs: Dashboard / Trips / Fuel / Settings

## Setup

```bash
brew install xcodegen
cd /Users/muhammetkocyigit/Desktop/bmwcenter
xcodegen generate
open QuickCar.xcodeproj
```

Set your Development Team in Xcode if needed for device builds. Simulator runs without a team.

## Run on Simulator

```bash
xcrun simctl boot "iPhone 17 Pro" || true
open -a Simulator
xcodebuild -project QuickCar.xcodeproj -scheme QuickCar \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -configuration Debug build
```

Then install/launch, or Run from Xcode (`⌘R`).

### Open CarPlay

Simulator menu: **I/O → External Displays → CarPlay**.

Mock adapter is enabled by default on Simulator (`Settings → Use mock adapter`).

## Requirements

- Xcode 15+
- iOS 17.0+
- Entitlement: `com.apple.developer.carplay-driving-task` (local debug / Simulator)
