import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    let settings: AppSettings
    let obd: OBDService
    let repository: TripRepository

    @Published var dtcs: [DTC] = []
    @Published var dtcMessage: String?
    @Published var exportURL: URL?

    init(settings: AppSettings, obd: OBDService, repository: TripRepository) {
        self.settings = settings
        self.obd = obd
        self.repository = repository
    }

    var connectionLabel: String {
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
            return String(localized: "connection.disconnected", table: "Localizable")
        }
    }

    func readDTCs() async {
        do {
            dtcs = try await obd.readDTCs()
            if dtcs.isEmpty {
                dtcMessage = String(localized: "dtc.none", table: "Localizable")
            } else {
                dtcMessage = String(format: String(localized: "dtc.count", table: "Localizable"), locale: .current, dtcs.count)
            }
        } catch {
            dtcMessage = String(localized: "connection.disconnected", table: "Localizable")
        }
    }

    func clearDTCs() async {
        try? await obd.clearDTCs()
        dtcs = []
        dtcMessage = String(localized: "dtc.none", table: "Localizable")
    }

    func exportAll() {
        exportURL = repository.exportCSV(range: DateInterval(start: .distantPast, end: Date()))
    }

    func deleteAll() {
        repository.deleteAll()
    }
}
