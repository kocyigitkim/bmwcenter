import Foundation
import AVFoundation
import AudioToolbox

@MainActor
final class AudioAnnouncer {
    private let synthesizer = AVSpeechSynthesizer()
    private let settings: AppSettings

    init(settings: AppSettings) {
        self.settings = settings
    }

    func announce(_ text: String, severity: AlertSeverity) {
        guard settings.spokenAlerts else { return }
        guard severity != .info else { return }
        speak(text, toneCount: severity == .critical ? 2 : 1)
    }

    func announceCare(_ text: String, severity: CueSeverity, toneCount: Int) {
        guard settings.spokenAlerts || settings.careSpokenCues || severity == .critical else { return }
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
}
