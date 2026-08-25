import AppIntents
import Foundation

struct FuelLevelIntent: AppIntent {
    static var title: LocalizedStringResource = "Fuel level"
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = await MainActor.run { () -> String in
            let env = AppEnvironment.shared
            let pct = env.obd.snapshot.fuelLevelPct ?? 0
            let tank = env.settings.tankCapacityL
            let litersLeft = tank * pct / 100
            let avg = env.tripRepository.summary(
                for: DateInterval(
                    start: Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date(),
                    end: Date()
                )
            ).avgL100
            let rangeKm = avg > 0.5 ? litersLeft / avg * 100 : 0
            let level = String(localized: "metric.fuelLevel", table: "Localizable")
            return "\(level): \(Int(pct.rounded()))% · \(Int(rangeKm.rounded())) km"
        }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}
