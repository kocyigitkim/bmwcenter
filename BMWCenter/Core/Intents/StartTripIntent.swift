import AppIntents
import Foundation

struct StartTripIntent: AppIntent {
    static var title: LocalizedStringResource = "Start trip"
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run {
            AppEnvironment.shared.tripRecorder.manualStart()
        }
        return .result(dialog: IntentDialog(stringLiteral: String(localized: "trip.recording", table: "Localizable")))
    }
}
