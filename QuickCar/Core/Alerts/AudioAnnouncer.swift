import Foundation
import AVFoundation
import AudioToolbox

@MainActor
final class AudioAnnouncer: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private let settings: AppSettings

    init(settings: AppSettings) {
        self.settings = settings
        super.init()
        synthesizer.delegate = self
    }

    func announce(_ text: String, severity: AlertSeverity) {
        guard settings.spokenAlerts else { return }
        guard severity != .info else { return }
        speak(text, toneCount: severity == .critical ? 2 : 1)
    }

    func announceCare(_ text: String, severity: CueSeverity, toneCount: Int, cueID: String = "") {
        // Coolant/overheat warnings are safety-critical — speak them even if
        // the user has muted spoken alerts/coaching, same as .critical always does.
        let isForcedOverheatCue = cueID.hasPrefix("overheat.")
            && (severity == .protective || severity == .critical)
        guard isForcedOverheatCue
            || settings.spokenAlerts || settings.careSpokenCues || severity == .critical
        else { return }
        if severity == .coach || severity == .celebration {
            guard settings.careSpokenCues || severity == .celebration else { return }
        }
        speak(text, toneCount: toneCount)
    }

    private func speak(_ text: String, toneCount: Int) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(
            .playback,
            options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        try? session.setActive(true)

        playTones(count: toneCount)

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: settings.languageCode)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
    }

    private func playTones(count: Int) {
        guard count > 0 else { return }
        for i in 0..<count {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.18) {
                AudioServicesPlaySystemSound(1057)
            }
        }
    }

    /// Duck sadece uyarı konuşurken aktif kalsın — bitince araç/telefon sesine
    /// hemen geri ver, oturumu açık bırakıp sürekli kısmayalım.
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in self?.deactivateIfIdle() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in self?.deactivateIfIdle() }
    }

    private func deactivateIfIdle() {
        guard !synthesizer.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
