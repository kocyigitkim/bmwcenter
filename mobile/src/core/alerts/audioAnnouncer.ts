import * as Speech from "expo-speech";
import { useAppSettings } from "../settings/appSettings";
import type { AlertSeverity, CueSeverity } from "./alertTypes";

function playTones(count: number) {
  // expo doesn't expose the iOS system-sound API used by the Swift version;
  // the spoken utterance itself is the primary cue on this platform.
  void count;
}

function speak(text: string, languageCode: string) {
  Speech.stop();
  playTones(1);
  Speech.speak(text, { language: languageCode, rate: 1.0 });
}

export const AudioAnnouncer = {
  announce(text: string, severity: AlertSeverity) {
    const settings = useAppSettings.getState();
    if (!settings.spokenAlerts) return;
    if (severity === "info") return;
    speak(text, settings.languageCode);
  },

  /** Coolant/overheat cues are safety-critical — spoken even if the user muted alerts/coaching.
   * Otherwise "Spoken alerts" is the master switch: off means silent, full stop — Care's own
   * "Spoken coaching cues" toggle can only narrow further (coach/celebration chatter), never
   * bypass the master switch. */
  announceCare(text: string, severity: CueSeverity, cueId = "") {
    const settings = useAppSettings.getState();
    const isForcedOverheatCue = cueId.startsWith("overheat.") && (severity === "protective" || severity === "critical");
    if (!isForcedOverheatCue && !settings.spokenAlerts) return;
    if ((severity === "coach" || severity === "celebration") && !(settings.careSpokenCues || severity === "celebration")) return;
    speak(text, settings.languageCode);
  },
};
