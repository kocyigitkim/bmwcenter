import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var obd: OBDService
    @Environment(AppSettings.self) private var settings
    @State private var showScan = false
    @State private var showDeleteConfirm = false
    @State private var showClearDTC = false
    @State private var dtcMessage: String?
    @State private var dtcs: [DTC] = []
    @State private var exportURL: URL?

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            List {
                Section(String(localized: "settings.connection", table: "Localizable")) {
                    LabeledContent(String(localized: "connection.connected", table: "Localizable"), value: connectionLabel)
                    Button(String(localized: "settings.scanAdapters", table: "Localizable")) { showScan = true }
                    Toggle(String(localized: "settings.autoConnect", table: "Localizable"), isOn: $settings.autoConnectOnLaunch)
                    #if DEBUG
                    Toggle(String(localized: "settings.useMock", table: "Localizable"), isOn: Binding(
                        get: { settings.useMockAdapter },
                        set: { newValue in
                            Task { await obd.setUseMock(newValue) }
                        }
                    ))
                    #endif
                }

                Section(String(localized: "settings.vehicle", table: "Localizable")) {
                    NavigationLink(String(localized: "settings.vehicle", table: "Localizable")) {
                        VehicleProfileView(settings: settings)
                    }
                }

                Section(String(localized: "settings.units", table: "Localizable")) {
                    Picker(String(localized: "settings.distanceUnits", table: "Localizable"), selection: $settings.unitSystem) {
                        ForEach(UnitSystem.allCases, id: \.self) { u in
                            Text(String(localized: String.LocalizationValue(u.displayKey), table: "Localizable")).tag(u)
                        }
                    }
                    Picker(String(localized: "settings.consumptionUnits", table: "Localizable"), selection: $settings.consumptionUnit) {
                        ForEach(ConsumptionUnit.allCases, id: \.self) { u in
                            Text(String(localized: String.LocalizationValue(u.displayKey), table: "Localizable")).tag(u)
                        }
                    }
                    Picker(String(localized: "settings.temperatureUnits", table: "Localizable"), selection: $settings.temperatureUnit) {
                        ForEach(TemperatureUnit.allCases, id: \.self) { u in
                            Text(String(localized: String.LocalizationValue(u.displayKey), table: "Localizable")).tag(u)
                        }
                    }
                    HStack {
                        Text(String(localized: "settings.currency", table: "Localizable"))
                        Spacer()
                        TextField("TRY", text: $settings.currencyCode)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 56)
                        TextField("", value: $settings.pricePerLiter, format: .number.precision(.fractionLength(2)))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 72)
                    }
                }

                Section(String(localized: "settings.language", table: "Localizable")) {
                    Picker(String(localized: "settings.appLanguage", table: "Localizable"), selection: $settings.languageCode) {
                        ForEach(availableLanguages, id: \.self) { code in
                            Text(languageName(code)).tag(code)
                        }
                    }
                }

                Section(String(localized: "calibration.title", table: "Localizable")) {
                    NavigationLink(String(localized: "calibration.title", table: "Localizable")) {
                        CalibrationView()
                    }
                }

                Section(String(localized: "settings.alerts", table: "Localizable")) {
                    Toggle(String(localized: "settings.enableAlerts", table: "Localizable"), isOn: $settings.enableAlerts)
                    Toggle(String(localized: "settings.spokenAlerts", table: "Localizable"), isOn: $settings.spokenAlerts)
                    Toggle(String(localized: "settings.useMotion", table: "Localizable"), isOn: $settings.useMotionSensors)
                }

                Section(String(localized: "settings.care.protection", table: "Localizable")) {
                    Toggle(String(localized: "settings.care.overheat", table: "Localizable"), isOn: $settings.careOverheatWatchdog)
                    Toggle(String(localized: "settings.care.coldShield", table: "Localizable"), isOn: $settings.careColdShield)
                    Picker(String(localized: "settings.care.thermal", table: "Localizable"), selection: $settings.careThermalShock) {
                        Text(String(localized: "settings.care.thermal.auto", table: "Localizable")).tag("auto")
                        Text(String(localized: "settings.care.thermal.always", table: "Localizable")).tag("always")
                        Text(String(localized: "settings.care.thermal.off", table: "Localizable")).tag("off")
                    }
                    Toggle(String(localized: "settings.care.battery", table: "Localizable"), isOn: $settings.careBatteryGuardian)
                    Picker(String(localized: "settings.care.sensitivity", table: "Localizable"), selection: $settings.careSensitivity) {
                        Text(String(localized: "settings.care.sensitivity.early", table: "Localizable")).tag("early")
                        Text(String(localized: "settings.care.sensitivity.balanced", table: "Localizable")).tag("balanced")
                        Text(String(localized: "settings.care.sensitivity.calm", table: "Localizable")).tag("calm")
                    }
                    Button(String(localized: "settings.care.resetBaselines", table: "Localizable")) {
                        env.care.resetBaselines()
                    }
                }

                Section(String(localized: "settings.care.coaching", table: "Localizable")) {
                    Toggle(String(localized: "settings.care.ecoCoach", table: "Localizable"), isOn: $settings.careEcoCoach)
                    Toggle(String(localized: "settings.care.spokenCues", table: "Localizable"), isOn: $settings.careSpokenCues)
                    Picker(String(localized: "settings.care.cueFrequency", table: "Localizable"), selection: $settings.careCueFrequency) {
                        Text(String(localized: "settings.care.cueFrequency.low", table: "Localizable")).tag("low")
                        Text(String(localized: "settings.care.cueFrequency.normal", table: "Localizable")).tag("normal")
                        Text(String(localized: "settings.care.cueFrequency.high", table: "Localizable")).tag("high")
                    }
                    Toggle(String(localized: "settings.care.gearCoach", table: "Localizable"), isOn: $settings.careGearCoach)
                    Toggle(String(localized: "settings.care.positiveTones", table: "Localizable"), isOn: $settings.carePositiveTones)
                }

                Section(String(localized: "settings.care.motivation", table: "Localizable")) {
                    Toggle(String(localized: "settings.care.challenges", table: "Localizable"), isOn: $settings.careWeeklyChallenges)
                    Toggle(String(localized: "settings.care.badges", table: "Localizable"), isOn: $settings.careBadgesStreak)
                    Toggle(String(localized: "settings.care.tripCard", table: "Localizable"), isOn: $settings.careTripSummaryCard)
                    Toggle(String(localized: "card.hideLocation", table: "Localizable"), isOn: $settings.careHideLocationSharing)
                }

                Section(String(localized: "settings.care.diagnostics", table: "Localizable")) {
                    Toggle(String(localized: "settings.care.fuelTrim", table: "Localizable"), isOn: $settings.careFuelTrimMonitor)
                    Toggle(String(localized: "settings.care.thermostat", table: "Localizable"), isOn: $settings.careThermostatWatch)
                    Toggle(String(localized: "settings.care.airflow", table: "Localizable"), isOn: $settings.careAirflowWatch)
                }

                Section(String(localized: "settings.care.maintenance", table: "Localizable")) {
                    Toggle(String(localized: "maint.adaptive", table: "Localizable"), isOn: $settings.careAdaptiveIntervals)
                    Toggle(String(localized: "settings.care.showSeverity", table: "Localizable"), isOn: $settings.careShowSeverityFactor)
                }

                Section(String(localized: "settings.trips", table: "Localizable")) {
                    Toggle(String(localized: "trip.autoRecord", table: "Localizable"), isOn: $settings.autoRecordTrips)
                    HStack {
                        Text(String(localized: "settings.startThreshold", table: "Localizable"))
                        Spacer()
                        TextField("", value: $settings.startThresholdKmh, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 64)
                    }
                    HStack {
                        Text(String(localized: "settings.stopDelay", table: "Localizable"))
                        Spacer()
                        TextField("", value: $settings.stopDelayS, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 64)
                    }
                }

                Section(String(localized: "settings.diagnostics", table: "Localizable")) {
                    NavigationLink(String(localized: "settings.vehicleScan", table: "Localizable")) {
                        VehicleScanView()
                    }
                    NavigationLink(String(localized: "settings.capabilities", table: "Localizable")) {
                        CapabilityScanView()
                    }
                    Toggle(
                        String(localized: "settings.backgroundDTC", table: "Localizable"),
                        isOn: $settings.backgroundDTCMonitor
                    )
                    if obd.activeExtendedPIDIds.isEmpty {
                        Text(String(localized: "vlinker.extended.none", table: "Localizable"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(obd.activeExtendedPIDIds, id: \.self) { pidId in
                            LabeledContent(String(localized: "vlinker.extended.active", table: "Localizable"), value: pidId)
                        }
                    }
                    Button("VLinker Probe") {
                        Task { await obd.runVLinkerProbe() }
                    }
                    ForEach(Array(obd.debugTrace.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                    Button(String(localized: "settings.readDTC", table: "Localizable")) {
                        Task {
                            do {
                                dtcs = try await obd.readDTCs()
                                dtcMessage = dtcs.isEmpty
                                    ? String(localized: "dtc.none", table: "Localizable")
                                    : String(format: String(localized: "dtc.count", table: "Localizable"), locale: .current, dtcs.count)
                            } catch {
                                dtcMessage = String(localized: "connection.disconnected", table: "Localizable")
                            }
                        }
                    }
                    if let dtcMessage {
                        Text(dtcMessage).foregroundStyle(.secondary)
                        ForEach(dtcs) { dtc in
                            Text(dtc.code)
                        }
                    }
                    Button(String(localized: "settings.clearDTC", table: "Localizable"), role: .destructive) {
                        showClearDTC = true
                    }
                }

                Section(String(localized: "settings.data", table: "Localizable")) {
                    Toggle(String(localized: "sync.icloud", table: "Localizable"), isOn: Binding(
                        get: { settings.iCloudSync },
                        set: { env.cloudSync.setEnabled($0) }
                    ))
                    NavigationLink(String(localized: "maintenance.title", table: "Localizable")) {
                        MaintenanceListView()
                    }
                    NavigationLink(String(localized: "dtc.stored", table: "Localizable")) {
                        DTCListView()
                    }
                    NavigationLink(String(localized: "battery.title", table: "Localizable")) {
                        BatteryHealthView()
                    }
                    Button(String(localized: "export.csv", table: "Localizable")) {
                        exportURL = env.tripRepository.exportCSV(range: DateInterval(start: .distantPast, end: .now))
                    }
                    Button(String(localized: "settings.deleteAll", table: "Localizable"), role: .destructive) {
                        showDeleteConfirm = true
                    }
                }

                Section(String(localized: "settings.about", table: "Localizable")) {
                    LabeledContent(String(localized: "settings.version", table: "Localizable"), value: appVersion)
                    LabeledContent(
                        String(localized: "settings.carplayStatus", table: "Localizable"),
                        value: carPlayCapabilityLabel
                    )
                }
            }
            .navigationTitle(String(localized: "tab.settings", table: "Localizable"))
            .sheet(isPresented: $showScan) { AdapterScanView() }
            .alert(String(localized: "alert.deleteAll.title", table: "Localizable"), isPresented: $showDeleteConfirm) {
                Button(String(localized: "action.cancel", table: "Localizable"), role: .cancel) {}
                Button(String(localized: "action.delete", table: "Localizable"), role: .destructive) {
                    env.tripRepository.deleteAll()
                }
            } message: {
                Text(String(localized: "alert.deleteAll.body", table: "Localizable"))
            }
            .alert(String(localized: "alert.clearDTC.title", table: "Localizable"), isPresented: $showClearDTC) {
                Button(String(localized: "action.cancel", table: "Localizable"), role: .cancel) {}
                Button(String(localized: "action.delete", table: "Localizable"), role: .destructive) {
                    Task {
                        try? await obd.clearDTCs(confirmed: true)
                        dtcs = []
                        dtcMessage = String(localized: "dtc.none", table: "Localizable")
                    }
                }
            } message: {
                Text(String(localized: "alert.clearDTC.body", table: "Localizable"))
            }
            .sheet(item: Binding(
                get: { exportURL.map { ShareItem(url: $0) } },
                set: { exportURL = $0?.url }
            )) { item in
                ActivityView(items: [item.url])
            }
        }
    }

    private var connectionLabel: String {
        switch obd.connection {
        case .connected(let name):
            return "\(String(localized: "connection.connected", table: "Localizable")) · \(name)"
        case .scanning:
            return String(localized: "connection.scanning", table: "Localizable")
        case .connecting, .initializing:
            return String(localized: "connection.connecting", table: "Localizable")
        case .failed(.bluetoothOff):
            return String(localized: "connection.bluetoothOff", table: "Localizable")
        default:
            if settings.useMockAdapter {
                return String(localized: "connection.mockActive", table: "Localizable")
            }
            return String(localized: "connection.disconnected", table: "Localizable")
        }
    }

    private var availableLanguages: [String] {
        let codes = Bundle.main.localizations.filter { $0 != "Base" }
        return codes.isEmpty ? ["en"] : codes.sorted()
    }

    private func languageName(_ code: String) -> String {
        switch code {
        case "en": return String(localized: "language.english", table: "Localizable")
        case "tr": return String(localized: "language.turkish", table: "Localizable")
        default: return code
        }
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    private var carPlayCapabilityLabel: String {
        #if targetEnvironment(simulator)
        return String(localized: "settings.carplay.simulator", table: "Localizable")
        #else
        return String(localized: "settings.carplay.needsProgram", table: "Localizable")
        #endif
    }
}

private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
