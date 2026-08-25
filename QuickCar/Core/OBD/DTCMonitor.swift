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
    private let profileStore: VehicleProfileStore
    private var task: Task<Void, Never>?
    private var knownOpenCodes: Set<String> = []
    /// DPF regen sırasında görülen geçici P24xx/P2Bxx kodları — 2. tarama teyit etmeden alarm üretme.
    private var pendingRegenCodes: [String: Int] = [:]

    init(
        obd: OBDService,
        settings: AppSettings,
        alertEngine: AlertEngine,
        modelContext: ModelContext,
        profileStore: VehicleProfileStore
    ) {
        self.obd = obd
        self.settings = settings
        self.alertEngine = alertEngine
        self.modelContext = modelContext
        self.profileStore = profileStore
        reloadKnownFromStore()
    }

    func start() {
        task?.cancel()
        task = Task { [weak self] in
            // İlk geçerli rpm frame'i gelene kadar bekle (sabit süre yerine hazır olma şartı), en fazla 5s.
            let deadline = Date().addingTimeInterval(5)
            while !Task.isCancelled, (self?.obd.snapshot.rpm) == nil, Date() < deadline {
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
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
            var codes = try await obd.readDTCs()
            if !profileStore.profile.supportsMode0A {
                // 2010 öncesi araçta Mode 0A boş yanıt verir → permanent olarak yanlış "temiz" sayılmasın.
                codes = codes.filter { $0.status != .permanent }
            }
            latest = codes
            lastScanAt = Date()
            let fresh = confirmedFresh(persistAndDiff(codes))
            if !fresh.isEmpty {
                newThisSession.append(contentsOf: fresh)
                alertEngine.notifyNewDTCs(fresh)
            }
            return codes
        } catch {
            return latest
        }
    }

    /// DPF regen aktifken görülen geçici P24xx/P2Bxx kodları ilk taramada bastırılır;
    /// ikinci ardışık görülüşte (regen bitmiş olsa da) alarma çıkar.
    private func confirmedFresh(_ fresh: [DTC]) -> [DTC] {
        guard !fresh.isEmpty else { return fresh }
        let regenTransient = profileStore.profile.hasDPF && obd.snapshot.isEngineRunning
        var confirmed: [DTC] = []
        for dtc in fresh {
            let isTransientPattern = dtc.code.hasPrefix("P24") || dtc.code.hasPrefix("P2B")
            guard regenTransient, isTransientPattern else {
                confirmed.append(dtc)
                continue
            }
            let seen = (pendingRegenCodes[dtc.code] ?? 0) + 1
            pendingRegenCodes[dtc.code] = seen
            if seen >= 2 { confirmed.append(dtc) }
        }
        return confirmed
    }

    private func nextIntervalSeconds() -> TimeInterval {
        let rpm = obd.snapshot.rpm ?? 0
        let speed = obd.snapshot.speedKmh ?? 0
        let profile = profileStore.profile
        let floor: TimeInterval
        switch profile.obdProtocol {
        case .canFast: floor = 20
        case .canSlow: floor = 45
        case .iso14230, .j1850: floor = 120
        }
        // Faster sampling when load/speed is high — pending codes often appear there.
        if rpm >= profile.redlineRpm * 0.75 || speed >= 140 { return floor }
        if rpm >= profile.redlineRpm * 0.55 || speed >= 100 { return max(floor, 35) }
        return max(floor, 75)
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
