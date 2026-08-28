import { resolveVehicleProfile } from "../profileResolver";
import { loadBundledPack } from "../vehicleProfilePack";
import {
  coolantAlarmC,
  coolantCriticalC,
  coolantNormalTopC,
  warmupTargetC,
} from "../vehicleProfile";

const pack = loadBundledPack();

describe("resolveVehicleProfile", () => {
  it("prefers an explicitly chosen catalog id over make/model", () => {
    const entry = pack.models[3]!;
    const profile = resolveVehicleProfile({
      profileId: entry.id,
      make: "Toyota",
      model: "Corolla",
      fuel: "gasoline",
      isTurbo: false,
    });
    expect(profile.id).toBe(entry.id);
    expect(profile.thermostatOpenC.value).toBe(entry.tstat);
  });

  it("matches a model entry and carries its thermostat over the archetype prior", () => {
    const entry = pack.models.find((m) => m.make !== "Universal")!;
    const profile = resolveVehicleProfile({
      make: entry.make,
      model: entry.model,
      fuel: entry.fuel ?? "gasoline",
      isTurbo: true,
    });
    expect(profile.make).toBe(entry.make);
    expect(profile.thermostatOpenC.value).toBe(entry.tstat);
    expect(profile.thermostatOpenC.source).toBe("service");
  });

  it("falls back to the brand layer when the model is unknown", () => {
    const brand = pack.brands[0]!;
    const profile = resolveVehicleProfile({
      make: brand.make,
      model: "Some Model That Does Not Exist",
      fuel: "gasoline",
      isTurbo: false,
    });
    expect(profile.make).toBe(brand.make);
    expect(profile.thermostatOpenC.value).toBe(brand.tstat);
    expect(profile.thermostatOpenC.source).toBe("brand");
  });

  it("falls back to an archetype prior when nothing matches", () => {
    const profile = resolveVehicleProfile({
      make: "Nonexistent Motors",
      model: "Ghost",
      fuel: "diesel",
      isTurbo: true,
    });
    expect(profile.overallConfidence).toBe("c");
    expect(profile.thermostatOpenC.source).toBe("archetype");
    expect(profile.archetype).toBe("dieselDPF");
  });

  it("resolves make aliases", () => {
    const profile = resolveVehicleProfile({ make: "vw", model: "Golf", fuel: "gasoline", isTurbo: true });
    expect(profile.make.toLowerCase()).toBe("volkswagen");
  });

  it("infers an archetype from OBD hints when there is no identity at all", () => {
    const profile = resolveVehicleProfile({
      fuel: "gasoline",
      isTurbo: false,
      obdHints: { sawZeroRpmWhileMoving: true },
    });
    expect(profile.archetype).toBe("hybridFHEV");
  });
});

describe("thermal envelope", () => {
  it("derives thresholds from the vehicle's thermostat rather than a fixed number", () => {
    const cool = resolveVehicleProfile({ fuel: "diesel", isTurbo: true }); // 82 °C thermostat
    const hot = resolveVehicleProfile({ fuel: "gasoline", isTurbo: true }); // 90 °C thermostat

    expect(coolantNormalTopC(cool)).toBe(95);
    expect(coolantNormalTopC(hot)).toBe(103);
    expect(coolantAlarmC(cool)).toBeLessThan(coolantAlarmC(hot));
    expect(warmupTargetC(cool)).toBe(79);
  });

  it("keeps a map-controlled thermostat at its flat high ceiling", () => {
    const euro = resolveVehicleProfile({
      make: "Nonexistent Motors",
      fuel: "gasoline",
      isTurbo: true,
      obdHints: { boostOverBaroKpa: 50 },
    });
    expect(euro.mapControlledThermostat.value).toBe(false);

    const mapControlled = pack.models.find((m) => m.mapControlled)!;
    const profile = resolveVehicleProfile({ profileId: mapControlled.id, fuel: "gasoline", isTurbo: true });
    expect(coolantNormalTopC(profile)).toBe(108);
  });

  it("never lets the critical threshold exceed the boiling ceiling", () => {
    for (const entry of pack.models) {
      const profile = resolveVehicleProfile({ profileId: entry.id, fuel: entry.fuel ?? "gasoline", isTurbo: true });
      const boiling = 108 + profile.capPressureBar.value * 12;
      expect(coolantCriticalC(profile)).toBeLessThanOrEqual(boiling);
      expect(coolantAlarmC(profile)).toBeLessThan(coolantCriticalC(profile));
    }
  });
});
