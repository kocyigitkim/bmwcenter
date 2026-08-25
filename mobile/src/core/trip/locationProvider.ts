import * as Location from "expo-location";

export interface SimpleLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
  gpsSpeedMs?: number;
}

class LocationProvider {
  lastLocation: SimpleLocation | undefined;
  private sub: Location.LocationSubscription | undefined;
  private permissionRequested = false;

  async requestPermission(): Promise<void> {
    if (this.permissionRequested) return;
    this.permissionRequested = true;
    await Location.requestForegroundPermissionsAsync().catch(() => undefined);
  }

  async start(): Promise<void> {
    await this.requestPermission();
    if (this.sub) return;
    this.sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
      (loc) => {
        this.lastLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy ?? undefined,
          gpsSpeedMs: loc.coords.speed ?? undefined,
        };
      }
    ).catch(() => undefined);
  }

  stop(): void {
    this.sub?.remove();
    this.sub = undefined;
  }

  resetDistance(): void {
    // Distance is derived from OBD speed integration (FuelIntegrationState), not GPS —
    // this hook exists for parity with the iOS LocationProvider API surface.
  }
}

export const locationProvider = new LocationProvider();
