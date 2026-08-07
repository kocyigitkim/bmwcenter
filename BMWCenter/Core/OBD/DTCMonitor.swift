import Foundation
import SwiftData
import Combine

/// Periodically reads Mode 03/07/0A while connected; alerts on newly seen codes.
/// Speeds up under high RPM/speed so transient drive-cycle faults are caught.
@MainActor
final class DTCMonitor: ObservableObject {
    @Published private(set) var latest: [DTC] = []
    @Published private(set) var newThisSession: [DTC] = []
    @Published private(set) var lastScanAt: Date?
    @Published private(set) var isScanning = false

    private let obd: OBDService
    private let settings: AppSettings
    private let alertEngine: AlertEngine
    private let modelContext: ModelContext
    private var task: Task<Void, Never>?
    private var knownOpenCodes: Set<String> = []

    init(
        obd: OBDService,
        settings: AppSettings,
        alertEngine: AlertEngine,
        modelContext: ModelContext
    ) {
        self.obd = obd
        self.settings = settings
        self.alertEngine = alertEngine
        self.modelContext = modelContext
        reloadKnownFromStore()
    }

    func start() {
        task?.cancel()
        task = Task { [weak self] in
            // First pass shortly after connect settles.
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            while !Task.isCancelled {
                guard let self else { break }
                await self.scanIfNeeded()
                let wait = self.nextIntervalSeconds()
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    /// Manual / UI-triggered scan that also updates tracking state.
    @discardableResult
    func scanNow() async -> [DTC] {
        await performScan(force: true)
    }

    private func scanIfNeeded() async {
        guard settings.backgroundDTCMonitor else { return }
        guard case .connected = obd.connection else { return }
        _ = await performScan(force: false)
    }

    private func performScan(force: Bool) async -> [DTC] {
        guard case .connected = obd.connection else { return latest }
        if isScanning { return latest }
        isScanning = true
        defer { isScanning = false }

        do {
            let codes = try await obd.readDTCs()
            latest = codes
            lastScanAt = Date()
            let fresh = persistAndDiff(codes)
            if !fresh.isEmpty {
                newThisSession.append(contentsOf: fresh)
                alertEngine.notifyNewDTCs(fresh)
            }
            return codes
        } catch {
            return latest
        }
    }

    private func nextIntervalSeconds() -> TimeInterval {
        let rpm = obd.snapshot.rpm ?? 0
        let speed = obd.snapshot.speedKmh ?? 0
        // Faster sampling when load/speed is high — pending codes often appear there.
        if rpm >= 5000 || speed >= 140 { return 20 }
        if rpm >= 3500 || speed >= 100 { return 35 }
        return 75
    }

    private func reloadKnownFromStore() {
        let descriptor = FetchDescriptor<DTCRecord>(
            predicate: #Predicate { $0.clearedAt == nil }
        )
        let rows = (try? modelContext.fetch(descriptor)) ?? []
        knownOpenCodes = Set(rows.map(\.code))
    }

    private func persistAndDiff(_ codes: [DTC]) -> [DTC] {
        var newly: [DTC] = []
        let now = Date()
        let active = Set(codes.map(\.code))

        for dtc in codes {
            if knownOpenCodes.contains(dtc.code) { continue }
            knownOpenCodes.insert(dtc.code)
            newly.append(dtc)
            modelContext.insert(
                DTCRecord(
                    code: dtc.code,
                    seenAt: now,
                    clearedAt: nil,
                    statusRaw: dtc.status.rawValue
                )
            )
        }

        // Mark codes that disappeared as cleared (soft close).
        if !codes.isEmpty {
            let descriptor = FetchDescriptor<DTCRecord>(
                predicate: #Predicate { $0.clearedAt == nil }
            )
            if let open = try? modelContext.fetch(descriptor) {
                for row in open where !active.contains(row.code) {
                    row.clearedAt = now
                    knownOpenCodes.remove(row.code)
                }
            }
        }

        try? modelContext.save()
        return newly
    }
}
