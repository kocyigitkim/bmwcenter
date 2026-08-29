# iOS native surfaces (from the removed Swift app)

The original QuickCar was a Swift/SwiftUI iOS app. It was replaced by the React
Native app in `mobile/`, and the Swift sources were removed once the port was
complete.

Three surfaces were **never ported**, because React Native has no equivalent for
them on Android and the app is currently Android-only. This note records what
they did, so a future Android Auto / Wear OS port has a starting point without
having to read the deleted code.

To read the originals: `git log --diff-filter=D -- QuickCar` gives the commit
that removed them, and `git show <commit>^:QuickCar/CarPlay/CarPlayCoordinator.swift`
prints any file as it was.

## CarPlay — `QuickCar/CarPlay/`

Registered as a **Driving Task** app, which is the CarPlay entitlement category
Apple grants for vehicle-data apps. That entitlement is requested per app and
per category; it is not something a library can provide.

Structure:

- `CarPlaySceneDelegate` — the UIScene entry point CarPlay connects to.
- `CarPlayCoordinator` — owned the `CPInterfaceController`, built a
  `CPTabBarTemplate` with four `CPListTemplate` tabs (Live / Trip / Fuel /
  History), and subscribed to the same app state the phone UI used.
- `Templates/` — one builder per tab, each a pure function from app state to a
  `CPListTemplate`. `AlertPresenter` handled `CPAlertTemplate` for warnings.
- `Rendering/` — `GaugeIconRenderer` drew gauge images for list rows (CarPlay
  rows take an image, not a custom view); `TextBar` rendered bar-like readouts
  as text, since CarPlay allows no arbitrary drawing.

Two constraints shaped all of it, and would shape an Android Auto port too:

1. **No custom views.** Everything is a fixed template with rows. Anything
   graphical has to be pre-rendered into an image or spelled out as text.
2. **Updates are throttled.** The coordinator held a 1 s `Throttle` and compared
   a signature string before pushing, because re-sending an unchanged template
   makes the head unit flicker.

Android Auto's template set is close enough in spirit that the tab layout and
the throttle-plus-signature pattern carry over; the categories Google allows are
narrower, and there is no "driving task" equivalent.

## Apple Watch — `QuickCarWatch/`

A small companion app: live speed / rpm / fuel / consumption, plus start and
stop buttons for a trip.

`WatchConnectivityBridge` was the whole design — a `WCSession` on both sides,
the phone pushing a snapshot dictionary and the watch sending
`{"action": "startTrip"}` / `"stopTrip"` back. The watch held no logic and no
storage; it was a remote display and two buttons.

A Wear OS port would keep that shape (the watch stays dumb, the phone decides)
and swap `WCSession` for the Wearable Data Layer.

## iOS widgets and Live Activity — `QuickCarWidgets/`

- `FuelLevelWidget` — fuel level and range.
- `LastTripWidget` — the last completed drive.
- `TripLiveActivityWidget` — a Live Activity for the trip in progress: duration,
  distance, average consumption, with a coloured status stripe.

Data reached them through an App Group container
(`group.com.muhammetkocyigit.quickcar`) written by `Core/Widgets/WidgetDataStore`,
with `WidgetCenter` asked to reload after each write.

The Android widget in `mobile/plugins/withHomeWidget.js` is the same idea
implemented differently: the app writes `quickcar-widget.json` into its own
files directory and the `AppWidgetProvider` reads it. There is no App Group
because on Android the widget already runs as the same app.

Android has no Live Activity equivalent. The closest is the ongoing trip
notification, which already exists in
`mobile/src/core/notifications/tripNotification.ts`.
