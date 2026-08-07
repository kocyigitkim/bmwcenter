import Foundation
import Combine
import OSLog

private let obdLog = Logger(subsystem: "com.muhammetkocyigit.bmwcenter", category: "VLinkerOBD")

@MainActor
final class OBDService: ObservableObject {
    @Published private(set) var snapshot = VehicleSnapshot()
    @Published private(set) var connection: OBDConnectionState = .idle
    @Published private(set) var discoveredAdapters: [DiscoveredAdapter] = []
    @Published private(set) var supportedPIDs: Set<UInt8> = []
    /// Derived capability groups for the current session (PRD §13/§22). Read-only
    /// telemetry today — nothing in this service consults it yet.
    var adapterCapabilities: AdapterCapabilities { AdapterCapabilities.detect(supportedPIDs: supportedPIDs) }
    @Published private(set) var instantL100: Double?
    @Published private(set) var idleLh: Double?
    @Published private(set) var fuelRateLh: Double?
    @Published private(set) var recentSpeeds: [Double] = []
    @Published private(set) var recentConsumption: [Double] = []
    /// Last VLinker probe lines (Settings / console).
    @Published private(set) var debugTrace: [String] = []

    private func persistDebug(_ lines: [String]) {
        debugTrace = lines
        let text = lines.joined(separator: "\n") + "\n"
        for line in lines { NSLog("%@", "VLINKER \(line)") }
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let url = dir.appendingPathComponent("vlinker_probe.txt")
        try? text.write(to: url, atomically: true, encoding: .utf8)
    }

    private let settings: AppSettings
    private var transport: OBDTransport?
    private var mockTransport: MockOBDTransport?
    private var bleTransport: BLEOBDTransport?
    private var pollTask: Task<Void, Never>?
    private var stateTask: Task<Void, Never>?
    private var adaptersTask: Task<Void, Never>?
    private var snapshotContinuations: [UUID: AsyncStream<VehicleSnapshot>.Continuation] = [:]

    var snapshots: AsyncStream<VehicleSnapshot> {
        AsyncStream { continuation in
            let id = UUID()
            self.snapshotContinuations[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in
                    self?.snapshotContinuations[id] = nil
                }
            }
        }
    }

    private var lastFast = Date.distantPast
    private var lastMedium = Date.distantPast
    private var lastSlow = Date.distantPast
    private var lastRare = Date.distantPast
    /// PIDs skipped by per-cycle budget; drained next cycle (prevents coolant/oil starvation).
    private var deferredPIDs: [UInt8] = []
    private let maxPIDsPerCycle = 6
    private var highRateContinuation: AsyncStream<(Date, Double)>.Continuation?
    private var highRateTask: Task<Void, Never>?
    private var fuelCalibrationFactor: Double { settings.fuelCalibrationFactor }
    private let extendedPIDs = ExtendedPIDSession()
    private var useStandardOilPID = false
    /// Active VLinker extended PID ids (BMW Mode 22, etc.) for UI/debug.
    @Published private(set) var activeExtendedPIDIds: [String] = []
    private var reconnectTask: Task<Void, Never>?
    private var reconnectAttempt = 0
    private var isStartingSession = false

    lazy var dtc: DTCService = DTCService { [weak self] in self?.transport }

    init(settings: AppSettings) {
        self.settings = settings
    }

    func start() async {
        await configureTransport()
        // configureTransport already starts state/adapters watchers — do not double-subscribe.
        await attemptAutoConnect(reason: .launch)
    }

    private enum AutoConnectReason {
        case launch
        case bluetoothPoweredOn
    }

    /// Connect last adapter when Bluetooth is available (launch or BT toggle on).
    private func attemptAutoConnect(reason: AutoConnectReason) async {
        guard settings.autoConnectOnLaunch else { return }
        guard !settings.useMockAdapter else {
            if reason == .launch {
                try? await connectMock()
            }
            return
        }
        guard settings.lastAdapterID != nil else { return }
        if case .connected = connection, pollTask != nil { return }
        if isStartingSession { return }
        if case .connecting = connection { return }
        if case .initializing = connection { return }
        await startSession()
    }

    /// Single entry for connect + poll. BLE layer never restarts polling alone.
    private func startSession() async {
        guard !settings.useMockAdapter else { return }
        guard let id = settings.lastAdapterID else { return }
        guard !isStartingSession else { return }
        isStartingSession = true
        defer { isStartingSession = false }

        pollTask?.cancel()
        pollTask = nil
        do {
            try await transport?.connect(peripheralID: id)
            reconnectAttempt = 0
            await beginPolling()
        } catch {
            obdLog.error("startSession fail \(error.localizedDescription, privacy: .public)")
            scheduleServiceReconnect()
        }
    }

    private func scheduleServiceReconnect() {
        guard settings.autoConnectOnLaunch, !settings.useMockAdapter else { return }
        guard settings.lastAdapterID != nil else { return }
        reconnectTask?.cancel()
        let delays: [TimeInterval] = [1.5, 3, 6, 12, 20]
        let delay = delays[min(reconnectAttempt, delays.count - 1)]
        reconnectAttempt += 1
        obdLog.notice("reconnect in \(delay, privacy: .public)s attempt=\(self.reconnectAttempt)")
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            if case .connected = self.connection, self.pollTask != nil { return }
            await self.startSession()
        }
    }

    private func handleTransportDisconnect() {
        pollTask?.cancel()
        pollTask = nil
        extendedPIDs.reset()
        activeExtendedPIDIds = []
        scheduleServiceReconnect()
    }

    func stop() {
        reconnectTask?.cancel()
        reconnectTask = nil
        pollTask?.cancel()
        pollTask = nil
        transport?.disconnect()
    }

    func setUseMock(_ enabled: Bool) async {
        settings.useMockAdapter = enabled
        stop()
        await configureTransport()
        if enabled {
            try? await connectMock()
        }
    }

    func scan() async {
        await transport?.startScan()
    }

    func connect(to id: UUID) async throws {
        settings.lastAdapterID = id
        reconnectTask?.cancel()
        reconnectAttempt = 0
        await startSession()
    }

    func reconnect() async {
        reconnectTask?.cancel()
        reconnectAttempt = 0
        if settings.useMockAdapter {
            try? await connectMock()
        } else if settings.lastAdapterID != nil {
            await startSession()
        } else {
            await scan()
        }
    }

    func refreshNow() async {
        await pollOnce(forceAll: true)
    }

    func readDTCs() async throws -> [DTC] {
        try await dtc.readDTCs()
    }

    /// See `DTCService.clearDTCs(confirmed:)` — `.serviceWrite`, requires explicit confirmation.
    func clearDTCs(confirmed: Bool) async throws {
        try await dtc.clearDTCs(confirmed: confirmed)
    }

    func readFreezeFrame() async throws -> VehicleSnapshot {
        var snap = VehicleSnapshot()
        for pid in [UInt8(0x0C), 0x0D, 0x05, 0x11, 0x04] {
            let command = String(format: "02%02X00", pid)
            guard let transport else { break }
            let response = try await transport.send(command, timeout: 2)
            if case .value(let bytes) = OBDFrameParser.parse(
                response: response,
                expectedPID: pid,
                byteCount: OBDPIDCatalog.pid(pid)?.byteCount ?? 1
            ), let value = OBDPIDCatalog.pid(pid)?.parse(bytes) {
                OBDPIDCatalog.apply(value, pid: pid, into: &snap)
            }
        }
        return snap
    }

    func readVIN() async throws -> String {
        guard let transport else { throw OBDError.disconnected }
        let response = try await transport.send("0902", timeout: 3)
        guard let vin = OBDFrameParser.parseVIN(response) else { throw OBDError.badResponse(response) }
        return vin
    }

    /// Mode 01 PID 0x01 (PRD §38 Emissions Readiness).
    func readReadiness() async throws -> ReadinessStatus {
        guard let transport else { throw OBDError.disconnected }
        let command = "0101"
        let response = try await transport.send(command, timeout: 3)
        switch OBDFrameParser.parse(
            response: response, expectedPID: 0x01, byteCount: 4, sentCommand: command
        ) {
        case .value(let bytes):
            guard let status = ReadinessParser.parse(bytes: bytes) else {
                throw OBDError.badResponse(response)
            }
            return status
        case .noData:
            throw OBDError.unsupportedPID(0x01)
        case .disconnected:
            throw OBDError.disconnected
        case .retry, .badResponse:
            throw OBDError.badResponse(response)
        }
    }

    func beginHighRateSpeedSampling() -> AsyncStream<(Date, Double)> {
        endHighRateSpeedSampling()
        return AsyncStream { continuation in
            self.highRateContinuation = continuation
            self.highRateTask = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self else { break }
                    if let speed = await self.queryPIDValue(0x0D) {
                        continuation.yield((Date(), speed))
                    }
                    try? await Task.sleep(nanoseconds: 70_000_000)
                }
            }
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.endHighRateSpeedSampling() }
            }
        }
    }

    func endHighRateSpeedSampling() {
        highRateTask?.cancel()
        highRateTask = nil
        highRateContinuation?.finish()
        highRateContinuation = nil
    }

    private func configureTransport() async {
        stateTask?.cancel()
        adaptersTask?.cancel()
        if settings.useMockAdapter {
            let mock = MockOBDTransport()
            mockTransport = mock
            bleTransport = nil
            transport = mock
        } else {
            let ble = BLEOBDTransport()
            ble.onBluetoothPoweredOn = { [weak self] in
                Task { @MainActor in
                    await self?.attemptAutoConnect(reason: .bluetoothPoweredOn)
                }
            }
            ble.onDisconnected = { [weak self] in
                Task { @MainActor in
                    self?.handleTransportDisconnect()
                }
            }
            bleTransport = ble
            mockTransport = nil
            transport = ble
        }
        await startStateWatch()
    }

    private func connectMock() async throws {
        guard let mock = mockTransport else { return }
        await mock.startScan()
        let id = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
        try await mock.connect(peripheralID: id)
        await beginPolling()
    }

    private func startStateWatch() async {
        guard let transport else { return }
        stateTask = Task { [weak self] in
            for await state in transport.state {
                await MainActor.run {
                    self?.connection = state
                }
            }
        }
        adaptersTask = Task { [weak self] in
            for await list in transport.discoveredAdapters {
                await MainActor.run {
                    self?.discoveredAdapters = list
                }
            }
        }
    }

    private func beginPolling() async {
        pollTask?.cancel()
        deferredPIDs.removeAll()
        useStandardOilPID = false
        extendedPIDs.reset()
        activeExtendedPIDIds = []
        // Drop stale gauges — otherwise Mode22 discover fires before ECU answers.
        snapshot = VehicleSnapshot()
        supportedPIDs = []
        // Discover supported Mode 01 PIDs
        if let bits = await queryPIDBytes(0x00, count: 4) {
            supportedPIDs.formUnion(OBDPIDCatalog.parseSupportedBitmask(bits, base: 0x00))
        }
        if let bits = await queryPIDBytes(0x20, count: 4) {
            supportedPIDs.formUnion(OBDPIDCatalog.parseSupportedBitmask(bits, base: 0x20))
        }
        if let bits = await queryPIDBytes(0x40, count: 4) {
            supportedPIDs.formUnion(OBDPIDCatalog.parseSupportedBitmask(bits, base: 0x40))
        }
        // Always keep core live PIDs — bitmask / NO DATA on 0100 must not starve gauges.
        supportedPIDs.formUnion([0x0C, 0x0D, 0x05])

        // Do NOT run Mode 22 before Mode 01 is proven.
        // VLinker MC-iOS: early ATSH7E0 / Mode22 can leave the bus unusable for live PIDs.

        // Mock / empty fallback: assume common PIDs
        if supportedPIDs.count <= 1 {
            supportedPIDs = Set(OBDPIDCatalog.all.map(\.pid))
        }

        // Warm standard PIDs first (RPM/speed/coolant).
        await pollOnce(forceAll: true)

        // One-shot oil/Mode22 probe into Documents + device console.
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await self?.runVLinkerProbe()
        }

        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce(forceAll: false)
                // VLinker BLE drops under aggressive polling — keep ≥150ms cadence.
                try? await Task.sleep(nanoseconds: 150_000_000)
            }
        }
    }

    /// Raw AT/OBD probe for VLinker MC-iOS oil path (logs + Settings).
    func runVLinkerProbe() async {
        guard let transport else {
            pushDebug("no transport")
            return
        }
        var lines: [String] = []
        func step(_ cmd: String, timeout: TimeInterval = 3) async {
            do {
                let raw = try await transport.send(cmd, timeout: timeout)
                let one = raw
                    .replacingOccurrences(of: "\r", with: "\\r")
                    .replacingOccurrences(of: "\n", with: "\\n")
                let line = "\(cmd) => \(String(one.prefix(160)))"
                lines.append(line)
                obdLog.notice("PROBE \(line, privacy: .public)")
                print("VLINKER_PROBE \(line)")
            } catch let err as OBDError {
                let tag: String
                switch err {
                case .disconnected: tag = "disconnected"
                case .timeout: tag = "timeout"
                case .bluetoothOff: tag = "btOff"
                case .notFound: tag = "notFound"
                case .badResponse(let s): tag = "bad:\(s)"
                case .unsupportedPID(let p): tag = "pid:\(p)"
                }
                let line = "\(cmd) => ERR \(tag)"
                lines.append(line)
                obdLog.error("PROBE \(line, privacy: .public)")
                print("VLINKER_PROBE \(line)")
            } catch {
                let line = "\(cmd) => ERR \(error.localizedDescription)"
                lines.append(line)
                print("VLINKER_PROBE \(line)")
            }
        }

        let platform = settings.vehiclePlatform.rawValue
        let conn = String(describing: connection)
        lines.append("platform=\(platform) mock=\(settings.useMockAdapter) conn=\(conn)")
        print("VLINKER_PROBE platform=\(platform) mock=\(settings.useMockAdapter) conn=\(conn)")
        obdLog.notice("PROBE platform=\(platform, privacy: .public)")

        await step("ATI")
        await step("STI")
        await step("ATDP")
        await step("ATDPN")
        await step("ATH1")
        await step("ATSH7DF")
        await step("0100", timeout: 4)
        await step("ATH0")
        await step("010C", timeout: 4)
        await step("0105", timeout: 4)
        // Functional DME oil path (proven: 62 44 02 …)
        await step("ATSH7DF")
        await step("1003", timeout: 3)
        await step("224402", timeout: 5)
        await step("22D3B0", timeout: 4)
        await step("222C10", timeout: 4)
        // EGS gearbox oil — physical header 7E1 required
        await step("ATSH7E1")
        await step("1003", timeout: 3)
        await step("221E01", timeout: 5)
        await step("ATSH7DF")
        await step("010C", timeout: 4)

        let oil = snapshot.oilTempC.map { String(format: "%.1f" , $0) } ?? "nil"
        let rpm = snapshot.rpm.map { String(format: "%.0f", $0) } ?? "nil"
        lines.append("snap oil=\(oil) rpm=\(rpm) ext=\(activeExtendedPIDIds.joined(separator: ",")) err=\(extendedPIDs.lastError ?? "-")")
        lines.append(contentsOf: extendedPIDs.debugLines.suffix(12))
        persistDebug(lines)
    }

    private func pushDebug(_ s: String) {
        persistDebug([s])
    }

    private func pollOnce(forceAll: Bool) async {
        guard case .connected = connection else { return }
        let now = Date()
        var due: [UInt8] = deferredPIDs
        deferredPIDs.removeAll(keepingCapacity: true)

        if forceAll || now.timeIntervalSince(lastFast) >= 0.2 {
            // Always poll speed/RPM even if bitmask lied.
            due.append(contentsOf: [0x0D, 0x0C])
            lastFast = now
        }
        // Coolant on the 1s tier. Standard oil PID only when Mode 22 is absent.
        if forceAll || now.timeIntervalSince(lastMedium) >= 1.0 {
            var medium: [UInt8] = [0x05, 0x11, 0x04, 0x0B]
            if useStandardOilPID {
                medium.insert(0x5C, at: 1)
            }
            if supportedPIDs.contains(0x5E) {
                medium.insert(0x5E, at: 0)
            } else if supportedPIDs.contains(0x10) {
                medium.insert(0x10, at: 0)
            }
            // Coolant always; other medium PIDs only if supported.
            due.append(0x05)
            due.append(contentsOf: medium.filter { $0 != 0x05 && supportedPIDs.contains($0) })
            lastMedium = now
        }
        if forceAll || now.timeIntervalSince(lastSlow) >= 5.0 {
            due.append(contentsOf: [0x2F, 0x42, 0x0F].filter { supportedPIDs.contains($0) })
            lastSlow = now
        }
        if forceAll || now.timeIntervalSince(lastRare) >= 30.0 {
            due.append(contentsOf: [0x33, 0x46, 0x06, 0x07, 0x3C, 0x31].filter { supportedPIDs.contains($0) })
            lastRare = now
        }

        // Dedupe, preserve first-seen order (deferred + higher-priority tiers first).
        var seen = Set<UInt8>()
        due = due.filter { seen.insert($0).inserted }

        // Budget: never discard temps — overflow waits for the next cycle.
        let queue = Array(due.prefix(maxPIDsPerCycle))
        deferredPIDs = Array(due.dropFirst(maxPIDsPerCycle))

        var snap = snapshot
        var mode01Fresh = false
        for pid in queue {
            if let value = await queryPIDValue(pid) {
                OBDPIDCatalog.apply(value, pid: pid, into: &snap)
                if pid == 0x0C || pid == 0x0D || pid == 0x05 {
                    mode01Fresh = true
                }
            }
        }
        // Mode 22 only after a fresh Mode 01 value this cycle (not stale snapshot).
        if let transport, mode01Fresh, settings.vehiclePlatform != .universal {
            snap = await extendedPIDs.pollDue(
                transport: transport,
                snap: snap,
                now: now,
                forceAll: forceAll,
                platform: settings.vehiclePlatform
            )
            activeExtendedPIDIds = extendedPIDs.active.map(\.id)
            if snap.oilTempC != nil {
                supportedPIDs.insert(0x5C)
            } else if useStandardOilPID == false, let oil = await queryPIDValue(0x5C) {
                useStandardOilPID = true
                supportedPIDs.insert(0x5C)
                snap.oilTempC = oil
            }
        }
        snap.timestamp = Date()
        snapshot = snap

        fuelRateLh = FuelCalculator.fuelRateLh(
            snapshot: snap,
            fuelType: settings.fuelType,
            displacementL: settings.displacementL,
            volumetricEfficiency: settings.volumetricEfficiency,
            calibrationFactor: fuelCalibrationFactor
        )
        let instant = FuelCalculator.instantL100(fuelRateLh: fuelRateLh, speedKmh: snap.speedKmh)
        instantL100 = instant.l100
        idleLh = instant.idleLh

        if let speed = snap.speedKmh {
            recentSpeeds.append(speed)
            if recentSpeeds.count > 60 { recentSpeeds.removeFirst(recentSpeeds.count - 60) }
        }
        if let c = instant.l100 ?? idleLh {
            recentConsumption.append(c)
            if recentConsumption.count > 60 { recentConsumption.removeFirst(recentConsumption.count - 60) }
        }

        for continuation in snapshotContinuations.values {
            continuation.yield(snap)
        }
    }

    private func queryPIDValue(_ pid: UInt8) async -> Double? {
        guard let def = OBDPIDCatalog.pid(pid) else { return nil }
        guard let bytes = await queryPIDBytes(pid, count: def.byteCount) else { return nil }
        return def.parse(bytes)
    }

    private func queryPIDBytes(_ pid: UInt8, count: Int) async -> [UInt8]? {
        guard let transport else { return nil }
        let command = ELM327Commands.mode01(pid)
        for _ in 0..<2 {
            do {
                let response = try await transport.send(command, timeout: 2)
                switch OBDFrameParser.parse(
                    response: response, expectedPID: pid, byteCount: count, sentCommand: command
                ) {
                case .value(let bytes): return bytes
                case .noData: return nil
                case .retry: continue
                case .badResponse: return nil
                case .disconnected:
                    connection = .failed(.disconnected)
                    return nil
                }
            } catch {
                return nil
            }
        }
        return nil
    }
}
