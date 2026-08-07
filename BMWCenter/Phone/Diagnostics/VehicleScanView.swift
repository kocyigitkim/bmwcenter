import SwiftUI

/// PRD §30/§31 Vehicle Health Scan / Scan Result — runs `OBDService.performScan()`
/// and shows the combined DTC + emissions readiness result. Read-only.
struct VehicleScanView: View {
    @EnvironmentObject private var obd: OBDService
    @State private var result: VehicleScanResult?
    @State private var isScanning = false

    var body: some View {
        List {
            Section {
                Button {
                    Task { await runScan() }
                } label: {
                    if isScanning {
                        ProgressView()
                    } else {
                        Text(String(localized: "scan.action", table: "Localizable"))
                    }
                }
                .disabled(isScanning)
            }

            if let result {
                Section(String(localized: "scan.overall", table: "Localizable")) {
                    overallRow(result.overallStatus)
                    LabeledContent(
                        String(localized: "scan.performedAt", table: "Localizable"),
                        value: result.performedAt.formatted(date: .omitted, time: .shortened)
                    )
                }

                Section(String(localized: "scan.dtcSection", table: "Localizable")) {
                    LabeledContent(String(localized: "dtc.stored", table: "Localizable"), value: "\(result.storedCount)")
                    LabeledContent(String(localized: "dtc.pending", table: "Localizable"), value: "\(result.pendingCount)")
                    LabeledContent(String(localized: "dtc.permanent", table: "Localizable"), value: "\(result.permanentCount)")
                    if result.dtcs.isEmpty {
                        Text(String(localized: "dtc.none", table: "Localizable"))
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(result.dtcs) { dtc in
                            Text(dtc.code)
                        }
                    }
                }

                if let readiness = result.readiness {
                    Section(String(localized: "scan.readinessSection", table: "Localizable")) {
                        LabeledContent(
                            String(localized: "scan.mil", table: "Localizable"),
                            value: readiness.milOn
                                ? String(localized: "common.on", table: "Localizable")
                                : String(localized: "common.off", table: "Localizable")
                        )
                        ForEach(readiness.supportedMonitors) { monitor in
                            LabeledContent(
                                monitorName(monitor.kind),
                                value: monitor.isReady
                                    ? String(localized: "scan.ready", table: "Localizable")
                                    : String(localized: "scan.notReady", table: "Localizable")
                            )
                        }
                    }
                } else {
                    Section {
                        Text(String(localized: "scan.readinessUnavailable", table: "Localizable"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(String(localized: "scan.title", table: "Localizable"))
    }

    private func overallRow(_ status: VehicleScanOverallStatus) -> some View {
        let (key, color): (String, Color) = switch status {
        case .good: ("scan.status.good", Color("state/ok"))
        case .attention: ("scan.status.attention", Color("state/warn"))
        case .critical: ("scan.status.critical", Color("state/crit"))
        }
        return LabeledContent(String(localized: "scan.status", table: "Localizable")) {
            Text(String(localized: String.LocalizationValue(key), table: "Localizable"))
                .font(.body.bold())
                .foregroundStyle(color)
        }
    }

    /// Builds the localization key as a plain String *before* wrapping it in
    /// `String.LocalizationValue` — doing the interpolation inline inside
    /// `String.LocalizationValue("prefix.\(x)")` instead triggers Swift's
    /// `ExpressibleByStringInterpolation` machinery, which treats `x` as a
    /// format-string substitution argument rather than part of the literal
    /// key, so it silently fails to match the catalog entry.
    private func monitorName(_ kind: ReadinessMonitorStatus.Kind) -> String {
        let key = "readiness.monitor.\(kind.rawValue)"
        return String(localized: String.LocalizationValue(key), table: "Localizable")
    }

    private func runScan() async {
        isScanning = true
        defer { isScanning = false }
        result = await obd.performScan()
    }
}
