jest.mock("expo-speech", () => ({
  stop: jest.fn(),
  speak: jest.fn(),
}));

jest.mock("react-native-mmkv", () => {
  const stores = new Map<string, unknown>();
  return {
    createMMKV: () => ({
      getString: (key: string) => stores.get(key),
      set: (key: string, value: unknown) => stores.set(key, value),
      delete: (key: string) => stores.delete(key),
    }),
  };
});

import { AudioAnnouncer } from "../audioAnnouncer";
import { useAppSettings } from "../../settings/appSettings";

const Speech = jest.requireMock("expo-speech");

function setSettings(partial: Partial<{ spokenAlerts: boolean; careSpokenCues: boolean }>) {
  useAppSettings.setState(partial as never);
}

describe("AudioAnnouncer.announce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("stays silent when spokenAlerts is off", () => {
    setSettings({ spokenAlerts: false });
    AudioAnnouncer.announce("coolant high", "warning");
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  test("speaks non-info severities when spokenAlerts is on", () => {
    setSettings({ spokenAlerts: true });
    AudioAnnouncer.announce("coolant high", "warning");
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });
});

describe("AudioAnnouncer.announceCare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("spokenAlerts=false silences non-overheat protective/critical cues (careSpokenCues no longer bypasses it)", () => {
    setSettings({ spokenAlerts: false, careSpokenCues: true });
    AudioAnnouncer.announceCare("Battery voltage is low", "protective", "battery.deep");
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  test("spokenAlerts=false still forces the safety overheat cue through", () => {
    setSettings({ spokenAlerts: false, careSpokenCues: false });
    AudioAnnouncer.announceCare("Engine overheating", "critical", "overheat.critical");
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  test("spokenAlerts=true + careSpokenCues=false silences coach chatter", () => {
    setSettings({ spokenAlerts: true, careSpokenCues: false });
    AudioAnnouncer.announceCare("Nice smooth shift", "coach", "gear.smooth");
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  test("spokenAlerts=true speaks non-overheat protective cues", () => {
    setSettings({ spokenAlerts: true, careSpokenCues: false });
    AudioAnnouncer.announceCare("Battery voltage is low", "protective", "battery.deep");
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });
});
