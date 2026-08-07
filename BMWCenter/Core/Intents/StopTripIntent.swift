import AppIntents
import Foundation

struct StopTripIntent: AppIntent {
    static var title: LocalizedStringResource = "Stop trip"
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let summary = await MainActor.run { () -> String in
            let live = AppEnvironment.shared.tripRecorder.live
            AppEnvironment.shared.tripRecorder.manualStop()
            let distance = Formatters.distance(live.distanceKm, settings: AppEnvironment.shared.settings)
            let duration = Formatters.liveDuration(live.durationS)
            return "\(distance) · \(duration)"
        }
        return .result(dialog: IntentDialog(stringLiteral: summary))
    }
}
