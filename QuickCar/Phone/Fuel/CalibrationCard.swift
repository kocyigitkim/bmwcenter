import SwiftUI

struct CalibrationCard: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings

    var measuredL: Double? = nil
    var calculatedL: Double? = nil
    var onReset: (() -> Void)? = nil

    private let requiredSamples = 2
    private var factor: Double { settings.fuelCalibrationFactor }
    private var acceptedCount: Int { env.fuelCalibrator.acceptedSampleCount }

    var body: some View {
        SectionCard(String(localized: "calibration.title", table: "Localizable")) {
            if acceptedCount < requiredSamples {
                Text(
                    String(
                        format: String(localized: "calibration.collecting", table: "Localizable"),
                        locale: .current,
                        acceptedCount,
                        requiredSamples
                    )
                )
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color.contentSecondary)
            } else {
                StatRow(
                    title: String(localized: "calibration.fuelFactor", table: "Localizable"),
                    value: String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), factor)
                )
            }
            if let measuredL {
                StatRow(
                    title: String(localized: "calibration.measured", table: "Localizable"),
                    value: Formatters.liters(measuredL)
                )
            }
            if let calculatedL {
                StatRow(
                    title: String(localized: "calibration.calculated", table: "Localizable"),
                    value: Formatters.liters(calculatedL)
                )
            }
            Button(String(localized: "calibration.reset", table: "Localizable"), role: .destructive) {
                if let onReset { onReset() } else { env.fuelCalibrator.reset() }
            }
            .font(.system(size: 14, weight: .semibold))
        }
    }
}
