import Foundation

@MainActor
final class DTCService {
    private let transportProvider: () -> OBDTransport?
    private var catalog: [String: DTCCatalogEntry] = [:]

    struct DTCCatalogEntry: Decodable, Sendable {
        var titleKey: String?
        var systemKey: String?
        var severity: String?
        var system: String?
        var bmw: Bool?
        var en: String?
        var tr: String?

        func summary(languageCode: String) -> String? {
            if languageCode.hasPrefix("tr") {
                return tr ?? en
            }
            return en ?? tr
        }
    }

    init(transportProvider: @escaping () -> OBDTransport?) {
        self.transportProvider = transportProvider
        loadCatalog()
    }

    private func loadCatalog() {
        guard let url = Bundle.main.url(forResource: "DTCCatalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([String: DTCCatalogEntry].self, from: data)
        else { return }
        catalog = decoded
    }

    func entry(for code: String) -> DTCCatalogEntry? {
        catalog[code]
    }

    /// All catalog entries sorted — BMW-flagged first.
    func allEntries(languageCode: String) -> [(code: String, summary: String, severity: String, bmw: Bool)] {
        catalog
            .compactMap { code, entry -> (String, String, String, Bool)? in
                guard let summary = entry.summary(languageCode: languageCode) else { return nil }
                return (code, summary, entry.severity ?? "medium", entry.bmw == true)
            }
            .sorted { lhs, rhs in
                if lhs.3 != rhs.3 { return lhs.3 && !rhs.3 }
                return lhs.0 < rhs.0
            }
    }

    func descriptionKey(for code: String) -> String? {
        catalog[code]?.titleKey
    }

    func summary(for code: String, languageCode: String) -> String? {
        catalog[code]?.summary(languageCode: languageCode)
    }

    func readStored() async throws -> [DTC] {
        try await read(command: ELM327Commands.readDTCs, status: .stored)
    }

    func readPending() async throws -> [DTC] {
        try await read(command: ELM327Commands.readPendingDTCs, status: .pending)
    }

    func readPermanent() async throws -> [DTC] {
        try await read(command: ELM327Commands.readPermanentDTCs, status: .permanent)
    }

    /// Mode 03 + 07 + 0A combined.
    func readDTCs() async throws -> [DTC] {
        var all: [DTC] = []
        all += (try? await readStored()) ?? []
        all += (try? await readPending()) ?? []
        all += (try? await readPermanent()) ?? []
        var map: [String: DTC] = [:]
        let priority: [DTC.Status: Int] = [.permanent: 3, .stored: 2, .pending: 1]
        for dtc in all {
            if let existing = map[dtc.code],
               (priority[existing.status] ?? 0) >= (priority[dtc.status] ?? 0) {
                continue
            }
            map[dtc.code] = dtc
        }
        return Array(map.values).sorted { $0.code < $1.code }
    }

    /// Mode 04, `.serviceWrite` (PRD §186/§35): erases stored/pending DTCs and
    /// resets emissions readiness monitors. Requires the caller to pass
    /// `confirmed: true` — normally right after the user accepts a UI
    /// confirmation dialog explaining that consequence.
    func clearDTCs(confirmed: Bool) async throws {
        guard confirmed else { throw DiagnosticConfirmationRequired(operation: "clearDTCs") }
        guard let transport = transportProvider() else { throw OBDError.disconnected }
        _ = try await transport.send(ELM327Commands.clearDTCs, timeout: 3)
    }

    private func read(command: String, status: DTC.Status) async throws -> [DTC] {
        guard let transport = transportProvider() else { throw OBDError.disconnected }
        let response = try await transport.send(command, timeout: 3)
        let language = UserDefaults.standard.string(forKey: "settings.languageCode") ?? "en"
        return OBDFrameParser.parseDTCResponse(response).map { dtc in
            var copy = dtc
            copy.status = status
            let entry = catalog[dtc.code]
            copy.descriptionKey = entry?.titleKey
            copy.summary = entry?.summary(languageCode: language)
                ?? String(localized: "dtc.manufacturerSpecific", table: "Localizable")
            copy.severity = entry?.severity
            return copy
        }
    }
}
