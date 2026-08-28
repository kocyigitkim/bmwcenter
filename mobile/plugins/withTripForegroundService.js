const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

/**
 * Android 14+ requires every foreground service to declare a type, and each
 * type needs its own permission. The trip service keeps the OBD (BLE) link and
 * GPS alive while the screen is off, so it is `connectedDevice|location`.
 *
 * Notifee ships the service (`app.notifee.core.ForegroundService`) without a
 * type; the generated android/ dir is gitignored, so the override has to be
 * injected at prebuild time rather than edited in place.
 */
const SERVICE_NAME = "app.notifee.core.ForegroundService";
const SERVICE_TYPE = "connectedDevice|location";
const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  // Lets the app show the system dialog asking to be excluded from battery
  // optimizations, so Android doesn't kill the trip service mid-drive.
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
];

module.exports = function withTripForegroundService(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;

    for (const permission of PERMISSIONS) {
      AndroidConfig.Permissions.addPermission(manifest, permission);
    }

    manifest.manifest.$ = manifest.manifest.$ ?? {};
    manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service ?? [];
    let service = app.service.find((s) => s.$["android:name"] === SERVICE_NAME);
    if (!service) {
      service = { $: { "android:name": SERVICE_NAME } };
      app.service.push(service);
    }
    service.$["android:foregroundServiceType"] = SERVICE_TYPE;
    // The library's own manifest declares the service too; ours must win.
    service.$["tools:replace"] = "android:foregroundServiceType";
    service.$["android:exported"] = "false";

    return mod;
  });
};
