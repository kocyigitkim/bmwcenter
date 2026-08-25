import Foundation
import CoreBluetooth
import OSLog

private let bleLog = Logger(subsystem: "com.muhammetkocyigit.quickcar", category: "VLinkerBLE")

actor OBDCommandQueue {
    private var busy = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func withLock<T>(_ body: () async throws -> T) async throws -> T {
        while busy {
            await withCheckedContinuation { cont in waiters.append(cont) }
        }
        busy = true
        defer {
            busy = false
            if !waiters.isEmpty {
                let next = waiters.removeFirst()
                next.resume()
            }
        }
        return try await body()
    }
}

final class BLEOBDTransport: NSObject, OBDTransport, @unchecked Sendable {
    /// Vgate / VLinker MC-iOS proprietary serial service.
    private static let vlinkerService = CBUUID(string: "E7810A71-73AE-499D-8C15-FAA9AEF0C3F2")
    private static let vlinkerSerial = CBUUID(string: "BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F")

    private static let serviceCandidates: [CBUUID] = [
        vlinkerService,
        CBUUID(string: "FFF0"),
        CBUUID(string: "FFE0"),
        CBUUID(string: "18F0"),
        CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    ]
    private static let nordicRX = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    private static let nordicTX = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")

    private var writePriority = -1
    private var notifyPriority = -1
    private var useCRLF = false
    private var notifyReady = false

    private let stateContinuation: AsyncStream<OBDConnectionState>.Continuation
    private let adaptersContinuation: AsyncStream<[DiscoveredAdapter]>.Continuation
    let state: AsyncStream<OBDConnectionState>
    let discoveredAdapters: AsyncStream<[DiscoveredAdapter]>

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var adapters: [DiscoveredAdapter] = []
    private var activePeripheral: CBPeripheral?
    private var writeChar: CBCharacteristic?
    private var notifyChar: CBCharacteristic?
    private var responseBuffer = ""
    private var pendingResponse: CheckedContinuation<String, Error>?
    private var responseTimeoutTask: Task<Void, Never>?
    private let commandQueue = OBDCommandQueue()
    /// Read-only connection-quality telemetry (PRD §118/§156) — never influences behavior.
    let metricsRecorder = TransportMetricsRecorder()
    private var pendingSendStart: Date?
    private var lastPeripheralID: UUID?
    private var lastCommand = ""
    /// Invalidates in-flight timeout tasks so a late wake cannot kill the next command.
    private var sendGeneration: UInt64 = 0
    private let nameFilter = [
        "OBD", "ELM", "VGATE", "VLINKER", "V-LINKER", "VEEPEAK", "ICAR",
        "MC-IOS", "MC+", "IOS-VLINK", "IOS-VLINKER", "VLINK"
    ]
    private var isConnecting = false
    private var wasPoweredOn = false
    /// Suppress disconnect callbacks during intentional teardown/reconnect.
    private var ignoreDisconnectCallback = false
    /// Single-flight connect; concurrent callers await the same task.
    private var connectTask: Task<Void, Error>?
    private var connectGeneration = 0
    private var fallbackDiscoverWorkItem: DispatchWorkItem?

    /// App layer handles reconnect + polling restart. BLE never auto-connects alone.
    var onBluetoothPoweredOn: (() -> Void)?
    var onDisconnected: (() -> Void)?

    override init() {
        var stateCont: AsyncStream<OBDConnectionState>.Continuation!
        state = AsyncStream { stateCont = $0 }
        stateContinuation = stateCont

        var adaptersCont: AsyncStream<[DiscoveredAdapter]>.Continuation!
        discoveredAdapters = AsyncStream { adaptersCont = $0 }
        adaptersContinuation = adaptersCont

        super.init()
        central = CBCentralManager(
            delegate: self,
            queue: .main,
            options: [CBCentralManagerOptionShowPowerAlertKey: true]
        )
        stateContinuation.yield(.idle)
    }

    func waitUntilPoweredOn(timeout: TimeInterval = 20) async -> Bool {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            switch central.state {
            case .poweredOn: return true
            case .unauthorized, .unsupported: return false
            default:
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
        return central.state == .poweredOn
    }

    func startScan() async {
        guard await waitUntilPoweredOn(timeout: 10) else {
            publish(.failed(.bluetoothOff))
            return
        }
        // Never scan while a session is live — scanning destabilizes VLinker.
        if case .connected = lastState, writeChar != nil { return }
        if isConnecting { return }

        adapters.removeAll()
        adaptersContinuation.yield([])
        publish(.scanning)
        central.scanForPeripherals(
            withServices: Self.serviceCandidates,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self else { return }
            guard case .scanning = self.lastState else { return }
            self.central.scanForPeripherals(
                withServices: nil,
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
            )
        }
    }

    func stopScan() {
        central.stopScan()
        if case .scanning = lastState {
            publish(.idle)
        }
    }

    private var lastState: OBDConnectionState = .idle

    func connect(peripheralID: UUID) async throws {
        // Deduplicate concurrent connect calls (launch + BT-on + UI).
        if let existing = connectTask {
            try await existing.value
            if case .connected = lastState, writeChar != nil,
               activePeripheral?.identifier == peripheralID {
                return
            }
        }

        connectGeneration += 1
        let generation = connectGeneration
        let task = Task { try await self.connectUnlocked(peripheralID: peripheralID) }
        connectTask = task
        defer {
            if connectGeneration == generation { connectTask = nil }
        }
        try await task.value
    }

    private func connectUnlocked(peripheralID: UUID) async throws {
        guard await waitUntilPoweredOn(timeout: 15) else { throw OBDError.bluetoothOff }

        if case .connected = lastState,
           writeChar != nil,
           notifyChar != nil,
           activePeripheral?.identifier == peripheralID,
           activePeripheral?.state == .connected {
            bleLog.info("Reuse live session")
            return
        }

        isConnecting = true
        defer { isConnecting = false }

        // Tear down any previous half-session cleanly before a new attempt.
        await teardownForReconnect(keepID: peripheralID)

        let peripheral = try await resolvePeripheral(peripheralID)
        lastPeripheralID = peripheralID
        central.stopScan()
        publish(.connecting(peripheral.name ?? "OBD"))
        activePeripheral = peripheral
        peripheral.delegate = self

        if peripheral.state != .connected {
            central.connect(
                peripheral,
                options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true]
            )
        } else {
            discoverSerialServices(on: peripheral)
        }

        try await waitUntilReady(timeout: 18)
        guard writeChar != nil, notifyChar != nil else { throw OBDError.disconnected }

        publish(.initializing)
        try await runInitSequence()
        guard writeChar != nil, activePeripheral?.state == .connected else {
            throw OBDError.disconnected
        }

        let name = peripheral.name ?? "ELM327"
        publish(.connected(name))
        bleLog.info(
            "Ready write=\(self.writeChar?.uuid.uuidString ?? "-", privacy: .public) crlf=\(self.useCRLF)"
        )
    }

    /// Soft disconnect without flipping shouldReconnect races — prepare for a fresh GATT map.
    private func teardownForReconnect(keepID: UUID) async {
        fallbackDiscoverWorkItem?.cancel()
        fallbackDiscoverWorkItem = nil
        central.stopScan()

        responseTimeoutTask?.cancel()
        if let pending = pendingResponse {
            pendingResponse = nil
            pending.resume(throwing: OBDError.disconnected)
        }

        let needsCancel: Bool = {
            guard let p = activePeripheral else { return false }
            if p.identifier != keepID { return true }
            // Same adapter but broken GATT — force fresh link.
            return writeChar == nil && p.state == .connected
        }()

        if needsCancel, let p = activePeripheral {
            ignoreDisconnectCallback = true
            central.cancelPeripheralConnection(p)
            activePeripheral = nil
            clearChars()
            try? await Task.sleep(nanoseconds: 450_000_000)
            ignoreDisconnectCallback = false
        } else {
            clearChars()
        }
    }

    private func resolvePeripheral(_ id: UUID) async throws -> CBPeripheral {
        if let existing = peripherals[id] { return existing }

        let retrieved = central.retrievePeripherals(withIdentifiers: [id])
        if let p = retrieved.first {
            peripherals[id] = p
            return p
        }

        let connected = central.retrieveConnectedPeripherals(withServices: Self.serviceCandidates)
        for p in connected {
            peripherals[p.identifier] = p
        }
        if let p = peripherals[id] { return p }

        // Short targeted scan only when not already connecting to a live session.
        await startScan()
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            if let p = peripherals[id] {
                stopScan()
                return p
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        stopScan()
        throw OBDError.notFound
    }

    func disconnect() {
        fallbackDiscoverWorkItem?.cancel()
        fallbackDiscoverWorkItem = nil
        connectTask?.cancel()
        connectTask = nil
        ignoreDisconnectCallback = true
        if let p = activePeripheral {
            central.cancelPeripheralConnection(p)
        }
        clearConnection()
        publish(.idle)
        ignoreDisconnectCallback = false
    }

    /// Snapshot of accumulated command latency/timeout stats for this session.
    var metricsSnapshot: TransportMetrics {
        get async { await metricsRecorder.metrics }
    }

    func send(_ command: String, timeout: TimeInterval) async throws -> String {
        try await commandQueue.withLock {
            try await self.sendUnlocked(command, timeout: timeout)
        }
    }

    private func sendUnlocked(_ command: String, timeout: TimeInterval) async throws -> String {
        guard let peripheral = activePeripheral, let writeChar,
              peripheral.state == .connected else {
            throw OBDError.disconnected
        }
        // Cancel prior timeout — stale wakes were killing the next AT/Mode22 command (~65ms false TIMEOUT).
        responseTimeoutTask?.cancel()
        responseTimeoutTask = nil
        if let stale = pendingResponse {
            pendingResponse = nil
            stale.resume(throwing: OBDError.timeout)
        }

        responseBuffer = ""
        let trimmed = command
            .trimmingCharacters(in: .newlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
        lastCommand = trimmed
        sendGeneration &+= 1
        let generation = sendGeneration
        let lineEnding = useCRLF ? "\r\n" : "\r"
        let payload = (trimmed + lineEnding).data(using: .ascii) ?? Data()

        let sendStart = Date()
        pendingSendStart = sendStart
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            self.pendingResponse = cont
            self.responseTimeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard let self, !Task.isCancelled else { return }
                guard self.sendGeneration == generation else { return }
                if let pending = self.pendingResponse {
                    self.pendingResponse = nil
                    NSLog("%@", "VLINKER TIMEOUT \(trimmed)")
                    let recorder = self.metricsRecorder
                    Task { await recorder.recordTimeout() }
                    pending.resume(throwing: OBDError.timeout)
                }
            }
            let type: CBCharacteristicWriteType =
                writeChar.properties.contains(.write) ? .withResponse : .withoutResponse
            if trimmed.hasPrefix("22") || trimmed.hasPrefix("STPX") || trimmed.hasPrefix("010")
                || trimmed.hasPrefix("ATSH") || trimmed.hasPrefix("ATCR")
                || trimmed.hasPrefix("ATAR") || trimmed == "ATI" || trimmed == "ATDP" {
                NSLog("%@", "VLINKER TX \(trimmed)")
            }
            peripheral.writeValue(payload, for: writeChar, type: type)
        }
    }

    private func waitUntilReady(timeout: TimeInterval) async throws {
        let start = Date()
        while true {
            if Task.isCancelled { throw OBDError.disconnected }
            if writeChar != nil, notifyChar != nil,
               (notifyReady || notifyChar?.isNotifying == true) {
                notifyReady = true
                try await Task.sleep(nanoseconds: 400_000_000)
                return
            }
            if Date().timeIntervalSince(start) > timeout { throw OBDError.timeout }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    private func runInitSequence() async throws {
        // Soft init: ATZ is heavy on VLinker — one attempt, then continue.
        // 0100 failure must not abort the whole BLE session.
        let sequence: [(command: String, timeout: TimeInterval, delayAfter: TimeInterval, required: Bool)] = [
            (ELM327Commands.reset, 5.0, 1.2, false),
            (ELM327Commands.echoOff, 2.0, 0.15, true),
            (ELM327Commands.linefeedOff, 2.0, 0.1, false),
            (ELM327Commands.headersOff, 2.0, 0.1, false),
            (ELM327Commands.adaptiveTiming, 2.0, 0.1, false),
            (ELM327Commands.autoProtocol, 3.0, 0.35, false),
            (ELM327Commands.supportedPIDs00, 4.0, 0.25, false)
        ]
        for item in sequence {
            var ok = false
            let tries = item.required ? 3 : 2
            for _ in 0..<tries {
                do {
                    _ = try await sendUnlocked(item.command, timeout: item.timeout)
                    ok = true
                    break
                } catch {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                }
            }
            if item.required, !ok { throw OBDError.timeout }
            if item.delayAfter > 0 {
                try await Task.sleep(nanoseconds: UInt64(item.delayAfter * 1_000_000_000))
            }
        }
    }

    private func publish(_ state: OBDConnectionState) {
        lastState = state
        stateContinuation.yield(state)
    }

    private func clearChars() {
        writeChar = nil
        notifyChar = nil
        writePriority = -1
        notifyPriority = -1
        useCRLF = false
        notifyReady = false
        responseBuffer = ""
    }

    private func clearConnection() {
        activePeripheral = nil
        clearChars()
        responseTimeoutTask?.cancel()
        if let pending = pendingResponse {
            pendingResponse = nil
            pending.resume(throwing: OBDError.disconnected)
        }
    }

    private func adoptWrite(_ c: CBCharacteristic, priority: Int) {
        guard priority > writePriority else { return }
        writeChar = c
        writePriority = priority
        if c.uuid == Self.vlinkerSerial { useCRLF = true }
    }

    private func adoptNotify(_ c: CBCharacteristic, peripheral: CBPeripheral, priority: Int) {
        guard priority > notifyPriority else { return }
        notifyChar = c
        notifyPriority = priority
        notifyReady = false
        if c.uuid == Self.vlinkerSerial { useCRLF = true }
        bleLog.info("RX \(c.uuid.uuidString, privacy: .public) prio=\(priority)")
        peripheral.setNotifyValue(true, for: c)
    }

    private func discoverSerialServices(on peripheral: CBPeripheral) {
        peripheral.discoverServices(Self.serviceCandidates)
        fallbackDiscoverWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self, weak peripheral] in
            guard let self, let peripheral else { return }
            // Only widen discovery if VLinker serial still missing.
            guard self.writeChar == nil || self.writePriority < 100 else { return }
            bleLog.info("Fallback full service discovery")
            peripheral.discoverServices(nil)
        }
        fallbackDiscoverWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    private func nameMatches(_ name: String?) -> Bool {
        guard let name, !name.isEmpty else { return false }
        let upper = name.uppercased()
        return nameFilter.contains { upper.contains($0) }
    }

    private func decodeChunk(_ data: Data) -> String? {
        if let s = String(data: data, encoding: .utf8) { return s }
        return String(data: data, encoding: .ascii)
    }
}

extension BLEOBDTransport: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            let becameOn = !wasPoweredOn
            wasPoweredOn = true
            if becameOn {
                onBluetoothPoweredOn?()
            }
        } else {
            wasPoweredOn = false
            clearConnection()
            publish(.failed(.bluetoothOff))
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
        let hasSerialService = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
            .contains(where: { Self.serviceCandidates.contains($0) }) == true
        guard nameMatches(name) || hasSerialService else { return }
        peripherals[peripheral.identifier] = peripheral
        let adapter = DiscoveredAdapter(
            id: peripheral.identifier,
            name: name ?? "OBD Adapter",
            rssi: RSSI.intValue
        )
        if let idx = adapters.firstIndex(where: { $0.id == adapter.id }) {
            adapters[idx] = adapter
        } else {
            adapters.append(adapter)
        }
        adaptersContinuation.yield(adapters.sorted { $0.rssi > $1.rssi })
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        bleLog.info("didConnect \(peripheral.name ?? peripheral.identifier.uuidString, privacy: .public)")
        discoverSerialServices(on: peripheral)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        bleLog.error("didFailToConnect \(error?.localizedDescription ?? "-", privacy: .public)")
        guard !ignoreDisconnectCallback else { return }
        clearConnection()
        publish(.failed(.notFound))
        onDisconnected?()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        bleLog.error("didDisconnect \(error?.localizedDescription ?? "clean", privacy: .public)")
        fallbackDiscoverWorkItem?.cancel()
        guard !ignoreDisconnectCallback else { return }
        // Ignore stale disconnect for a peripheral we already replaced.
        guard activePeripheral == nil || activePeripheral?.identifier == peripheral.identifier else { return }
        clearConnection()
        publish(.failed(.disconnected))
        onDisconnected?()
    }
}

extension BLEOBDTransport: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard peripheral.identifier == activePeripheral?.identifier else { return }
        guard let services = peripheral.services else { return }
        let ordered = services.sorted { a, b in
            (a.uuid == Self.vlinkerService ? 0 : 1) < (b.uuid == Self.vlinkerService ? 0 : 1)
        }
        for service in ordered {
            if service.uuid == Self.vlinkerService {
                peripheral.discoverCharacteristics([Self.vlinkerSerial], for: service)
            } else if writePriority < 100 {
                // Skip noisy services once VLinker serial is locked.
                peripheral.discoverCharacteristics(nil, for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard peripheral.identifier == activePeripheral?.identifier else { return }
        guard let chars = service.characteristics else { return }
        for c in chars {
            let uuid = c.uuid.uuidString.uppercased()

            if c.uuid == Self.vlinkerSerial {
                adoptWrite(c, priority: 100)
                adoptNotify(c, peripheral: peripheral, priority: 100)
                fallbackDiscoverWorkItem?.cancel()
                continue
            }
            // Once VLinker serial is locked, ignore other UART clones.
            if writePriority >= 100 { continue }

            if c.uuid == Self.nordicRX { adoptWrite(c, priority: 80); continue }
            if c.uuid == Self.nordicTX { adoptNotify(c, peripheral: peripheral, priority: 80); continue }
            if uuid == "FFE1" {
                adoptWrite(c, priority: 70)
                adoptNotify(c, peripheral: peripheral, priority: 70)
                continue
            }
            if uuid == "FFF2" { adoptWrite(c, priority: 60); continue }
            if uuid == "FFF1" { adoptNotify(c, peripheral: peripheral, priority: 60); continue }
            if uuid == "2AF1" { adoptWrite(c, priority: 20); continue }
            if uuid == "2AF0" { adoptNotify(c, peripheral: peripheral, priority: 20); continue }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error {
            bleLog.error("notify state err \(error.localizedDescription, privacy: .public)")
            return
        }
        if characteristic == notifyChar, characteristic.isNotifying {
            notifyReady = true
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic == notifyChar || characteristic.uuid == Self.vlinkerSerial else { return }
        guard let data = characteristic.value, let chunk = decodeChunk(data) else { return }
        responseBuffer += chunk
        // Only the ELM prompt ends a frame — early OK/NO DATA matching caused double-finish races.
        guard responseBuffer.contains(">") else { return }
        responseTimeoutTask?.cancel()
        responseTimeoutTask = nil
        let response = responseBuffer
        responseBuffer = ""
        if lastCommand.hasPrefix("22") || lastCommand.hasPrefix("AT") || lastCommand.hasPrefix("ST") {
            let preview = response
                .replacingOccurrences(of: "\r", with: "\\r")
                .replacingOccurrences(of: "\n", with: "\\n")
            NSLog("%@", "VLINKER RX \(lastCommand) => \(String(preview.prefix(160)))")
        }
        if let pending = pendingResponse {
            pendingResponse = nil
            if let start = pendingSendStart {
                pendingSendStart = nil
                let latencyMs = Date().timeIntervalSince(start) * 1000
                let recorder = metricsRecorder
                Task { await recorder.recordSuccess(latencyMs: latencyMs) }
            }
            pending.resume(returning: response)
        }
    }
}
