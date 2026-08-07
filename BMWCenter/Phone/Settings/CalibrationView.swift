import SwiftUI

struct CalibrationView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section(String(localized: "calibration.fuelFactor", table: "Localizable")) {
                CalibrationCard()
            }
            Section(String(localized: "calibration.speedFactor", table: "Localizable")) {
                StatRow(
                    title: String(localized: "calibration.speedFactor", table: "Localizable"),
                    value: String(
                        format: "%.3f",
                        locale: Locale(identifier: "en_US_POSIX"),
                        settings.speedCalibrationFactor
                    )
                )
                Toggle(
                    String(localized: "calibration.applySpeed", table: "Localizable"),
                    isOn: $settings.applySpeedCorrection
                )
                Button(String(localized: "calibration.reset", table: "Localizable"), role: .destructive) {
                    env.speedCalibrator.reset()
                }
            }
        }
        .navigationTitle(String(localized: "calibration.title", table: "Localizable"))
    }
}
