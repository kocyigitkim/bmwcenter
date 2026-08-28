import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Whether a `MapView` can safely be mounted.
 *
 * iOS uses Apple Maps and needs no credentials. Android is Google Maps only,
 * and the SDK throws `RuntimeException: API key not found` on init when
 * `com.google.android.geo.API_KEY` is missing from the manifest — it does not
 * degrade to a blank map. Mounting one unconditionally therefore crashes the
 * screen outright on any build without a key.
 *
 * To enable the real map on Android, add the key to app.json:
 *
 *   "android": { "config": { "googleMaps": { "apiKey": "..." } } }
 *
 * and rebuild. Until then callers should fall back to `RouteSketch`.
 */
export function isNativeMapAvailable(): boolean {
  if (Platform.OS === "ios") return true;
  if (Platform.OS !== "android") return false;
  const key = (
    Constants.expoConfig?.android?.config?.googleMaps as { apiKey?: string } | undefined
  )?.apiKey;
  return typeof key === "string" && key.length > 0;
}
