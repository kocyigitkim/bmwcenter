import Foundation

/// Simulates a 300s cyclic drive profile and responds to ELM327 Mode 01 queries.
final class MockOBDTransport: OBDTransport, @unchecked Sendable {
    private let stateContinuation: AsyncStream<OBDConnectionState>.Continuation
    private let adaptersContinuation: AsyncStream<[DiscoveredAdapter]>.Continuation
    let state: AsyncStream<OBDConnectionState>
    let discoveredAdapters: AsyncStream<[DiscoveredAdapter]>

    private let mockID = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
    private var connected = false
    private var startDate = Date()
    private var fuelUsedL: Double = 0
    private var lastTick = Date()
    private var fuelLevelStart: Double = 78
    private let lock = NSLock()
    private var supported: Set<UInt8> = Set(OBDPIDCatalog.all.map(\.pid))
    /// Simulates a slow/degraded adapter (PRD §149) — added per-command delay, seconds.
    private let responseDelay: TimeInterval
    /// Simulates an unexpected mid-session BLE drop (PRD §149) — seconds after connect.
    private let disconnectAfter: TimeInterval?

    init(responseDelay: TimeInterval = 0, disconnectAfter: TimeInterval? = nil) {
        self.responseDelay = responseDelay
        self.disconnectAfter = disconnectAfter
        var stateCont: AsyncStream<OBDConnectionState>.Continuation!
        state = AsyncStream { stateCont = $0 }
        stateContinuation = stateCont

        var adaptersCont: AsyncStream<[DiscoveredAdapter]>.Continuation!
        discoveredAdapters = AsyncStream { adaptersCont = $0 }
        adaptersContinuation = adaptersCont

        stateContinuation.yield(.idle)
    }

    func startScan() async {
        stateContinuation.yield(.scanning)
        let adapter = DiscoveredAdapter(id: mockID, name: "Mock ELM327", rssi: -40)
        adaptersContinuation.yield([adapter])
        try? await Task.sleep(nanoseconds: 200_000_000)
        stateContinuation.yield(.idle)
    }

    func stopScan() {}

    func connect(peripheralID: UUID) async throws {
        guard peripheralID == mockID else { throw OBDError.notFound }
        stateContinuation.yield(.connecting("Mock ELM327"))
        try? await Task.sleep(nanoseconds: 150_000_000)
        stateContinuation.yield(.initializing)
        try? await Task.sleep(nanoseconds: 100_000_000)
        lock.lock()
        connected = true
        startDate = Date()
        fuelUsedL = 0
        lastTick = Date()
        fuelLevelStart = 78
        lock.unlock()
        stateContinuation.yield(.connected("Mock ELM327"))
    }

    func disconnect() {
        lock.lock()
        connected = false
        lock.unlock()
        stateContinuation.yield(.idle)
    }

    func send(_ command: String, timeout: TimeInterval) async throws -> String {
        lock.lock()
        let isConnected = connected
        let sessionStart = startDate
        lock.unlock()
        guard isConnected else { throw OBDError.disconnected }

        if let disconnectAfter, Date().timeIntervalSince(sessionStart) >= disconnectAfter {
            lock.lock()
            connected = false
            lock.unlock()
            stateContinuation.yield(.failed(.disconnected))
            throw OBDError.disconnected
        }

        if responseDelay > 0 {
            try? await Task.sleep(nanoseconds: UInt64(responseDelay * 1_000_000_000))
            if responseDelay >= timeout { throw OBDError.timeout }
        }

        let cmd = command.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if cmd.hasPrefix("AT") {
            if cmd == "ATZ" { try? await Task.sleep(nanoseconds: 50_000_000) }
            return "OK"
        }
        if cmd == "0100" { return "41 00 BE 3E A8 13" }
        if cmd == "0120" { return "41 20 A0 07 B0 15" }
        if cmd == "0140" { return "41 40 FE D0 00 00" }
        if cmd == "0160" { return "41 60 00 00 00 00" }
        if cmd == "0900" { return "49 00 55 40 00 00" }
        if cmd == "0902" {
            return "014\r0:490201574241\r1:314A5A31323334\r2:353637383930"
        }
        if cmd == "03" { return "43 01 33 00 00" }
        if cmd == "07" { return "47 00" }
        if cmd == "04" { return "44" }
        // BMW F30/N13 MEVD1725 Mode 22 — oil DID D3B0 (A-40). Standard 0x5C absent.
        if cmd == "22D3B0" {
            let t = currentSnapshot().oilTempC ?? 90
            let a = max(0, min(255, Int((t + 40).rounded())))
            return String(format: "62 D3 B0 %02X", a)
        }
        if cmd == "224402" {
            let t = currentSnapshot().oilTempC ?? 90
            let raw = max(0, min(0xFFFF, Int(((t + 48) * 255 / 191.25).rounded())))
            return String(format: "62 44 02 %02X %02X", (raw >> 8) & 0xFF, raw & 0xFF)
        }
        if cmd == "222C10" || cmd == "222C11" {
            let mbar = Int((currentSnapshot().mapKpa ?? 101) * 10)
            return String(format: "62 %@ %02X %02X", cmd == "222C10" ? "2C 10" : "2C 11", (mbar >> 8) & 0xFF, mbar & 0xFF)
        }
        if cmd == "222B0D" {
            return "62 2B 0D 01 F4" // 50.0 bar
        }
        if cmd == "22586F" {
            // A≈9 → ~0 bar gauge at rest; higher with RPM in the drive profile.
            let rpm = currentSnapshot().rpm ?? 800
            let a = max(9, min(20, Int(9 + rpm / 800)))
            return String(format: "62 58 6F %02X 00", a)
        }

        guard cmd.count >= 4,
              cmd.hasPrefix("01"),
              let pid = UInt8(String(cmd.dropFirst(2).prefix(2)), radix: 16),
              let def = OBDPIDCatalog.pid(pid) else {
            return "?"
        }

        let snap = currentSnapshot()
        // Simulate BMW: no Mode 01 oil temp PID.
        if pid == 0x5C { return "NO DATA" }
        guard let value = value(for: pid, snap: snap) else { return "NO DATA" }
        let bytes = encode(pid: pid, value: value, byteCount: def.byteCount)
        let hex = bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
        return "41 \(String(format: "%02X", pid)) \(hex)"
    }

    func currentSnapshot() -> VehicleSnapshot {
        lock.lock()
        defer { lock.unlock() }
        let elapsed = Date().timeIntervalSince(startDate).truncatingRemainder(dividingBy: 300)
        var snap = profile(at: elapsed)
        let now = Date()
        let dt = now.timeIntervalSince(lastTick)
        if dt > 0, dt < 2, let rate = FuelCalculator.fuelRateLh(
            snapshot: snap,
            fuelType: .gasoline,
            displacementL: 2.0,
            volumetricEfficiency: 0.85,
            calibrationFactor: 1.0
        ) {
            fuelUsedL += rate * dt / 3600
        }
        lastTick = now
        snap.fuelLevelPct = max(5, fuelLevelStart - fuelUsedL / 60.0 * 100)
        snap.timestamp = now
        return snap
    }

    // MARK: - 300s profile

    private func profile(at t: Double) -> VehicleSnapshot {
        var s = VehicleSnapshot()
        s.baroKpa = 101
        s.ambientC = 22
        s.ltftBank1 = 2.3
        s.stftBank1 = 4 * sin(t / 3)

        // Coolant: 24 → 92 over 90s log-ish, then 88–94
        if t < 90 {
            s.coolantC = 24 + (92 - 24) * log(1 + t) / log(91)
        } else {
            s.coolantC = 91 + 3 * sin(t / 8)
        }
        // Oil: coolant - 6, 40s delayed
        let oilT = max(0, t - 40)
        if oilT < 90 {
            s.oilTempC = (24 + (92 - 24) * log(1 + oilT) / log(91)) - 6
        } else {
            s.oilTempC = (s.coolantC ?? 90) - 6
        }

        switch t {
        case 0..<5:
            // Cold start: rpm 0→1400→800, voltage dip 12.4→9.8→14.1
            let p = t / 5
            if t < 1.2 {
                s.rpm = 1400 * (t / 1.2)
                s.voltage = 12.4 - (12.4 - 9.8) * (t / 1.2)
            } else {
                s.rpm = 1400 - 600 * ((t - 1.2) / 3.8)
                s.voltage = 9.8 + (14.1 - 9.8) * min(1, (t - 1.2) / 2)
            }
            s.speedKmh = 0
            s.throttlePct = 15 * p
        case 5..<20:
            s.speedKmh = 0
            s.rpm = 780 + 30 * sin(t)
            s.voltage = 14.1 + 0.2 * sin(t * 2)
            s.throttlePct = 8
        case 20..<60:
            let p = (t - 20) / 40
            s.speedKmh = 52 * p
            s.rpm = 1200 + 1400 * p
            s.throttlePct = 20 + 40 * p
            s.voltage = 14.1
        case 60..<120:
            s.speedKmh = 48 + 6 * sin((t - 60) / 5)
            s.rpm = 1700 + 200 * sin((t - 60) / 4)
            s.throttlePct = 25 + 10 * sin(t)
            s.voltage = 14.1
        case 120..<140:
            s.speedKmh = 0
            s.rpm = 800
            s.throttlePct = 8
            s.voltage = 14.1
        case 140..<145:
            // Harsh brake sample: 52→8 over 5s ≈ -3.4 m/s²
            let p = (t - 140) / 5
            s.speedKmh = 52 - 44 * p
            s.rpm = 1600 - 600 * p
            s.throttlePct = 5
            s.voltage = 14.1
        case 145..<185:
            let p = (t - 145) / 40
            s.speedKmh = 118 * p
            s.rpm = 2100 + 1300 * p
            s.throttlePct = 40 + 40 * p
            s.mapKpa = 101 + 40 + 55 * p
            s.voltage = 14.1
        case 185..<265:
            s.speedKmh = 116 + 4 * sin((t - 185) / 6)
            s.rpm = 2350 + 80 * sin((t - 185) / 5)
            s.throttlePct = 55
            s.mapKpa = 180
            s.voltage = 14.1
        case 265..<292:
            let p = (t - 265) / 27
            s.speedKmh = 116 * (1 - p)
            s.rpm = 2300 - 1540 * p
            s.throttlePct = 40 * (1 - p)
            s.mapKpa = 140 - 40 * p
            s.voltage = 14.1
        default:
            // Park 292–300
            s.speedKmh = 0
            s.rpm = 0
            s.throttlePct = 0
            s.voltage = 12.3
            s.mapKpa = 101
        }

        if s.mapKpa == nil { s.mapKpa = 101 }
        let rpm = s.rpm ?? 0
        let throttle = s.throttlePct ?? 0
        if rpm > 300 {
            let base = 2.4 + rpm / 1000 * (1.6 + throttle / 100 * 9.0)
            let noise = 1 + (Double.random(in: -0.03...0.03))
            s.mafGs = base * noise
            s.engineLoadPct = min(100, throttle * 1.2)
            s.intakeAirC = 28 + throttle / 10
            s.catalystC = 400 + rpm / 10
            s.pedalPct = throttle
            s.timingAdvance = 10 + throttle / 10
        } else {
            s.mafGs = 0
            s.engineLoadPct = 0
        }
        s.runtimeS = t
        return s
    }

    private func value(for pid: UInt8, snap: VehicleSnapshot) -> Double? {
        switch pid {
        case 0x04: return snap.engineLoadPct
        case 0x05: return snap.coolantC
        case 0x06: return snap.stftBank1
        case 0x07: return snap.ltftBank1
        case 0x08: return snap.stftBank2
        case 0x09: return snap.ltftBank2
        case 0x0B: return snap.mapKpa
        case 0x0C: return snap.rpm
        case 0x0D: return snap.speedKmh
        case 0x0E: return snap.timingAdvance
        case 0x0F: return snap.intakeAirC
        case 0x10: return snap.mafGs
        case 0x11: return snap.throttlePct
        case 0x1F: return snap.runtimeS
        case 0x21: return snap.distanceWithMILKm ?? 0
        case 0x23: return snap.fuelRailKpa ?? 350
        case 0x2C: return 0
        case 0x2F: return snap.fuelLevelPct
        case 0x31: return snap.distanceSinceClearKm ?? 120
        case 0x33: return snap.baroKpa
        case 0x3C: return snap.catalystC
        case 0x42: return snap.voltage
        case 0x45: return snap.throttlePct
        case 0x46: return snap.ambientC
        case 0x49: return snap.pedalPct
        case 0x5C: return snap.oilTempC
        case 0x5E:
            guard let maf = snap.mafGs else { return nil }
            return maf * FuelType.gasoline.mafToLh
        default: return nil
        }
    }

    private func encode(pid: UInt8, value: Double, byteCount: Int) -> [UInt8] {
        switch pid {
        case 0x0C:
            let raw = Int(value * 4)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x10:
            let raw = Int(value * 100)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x1F, 0x21, 0x31:
            let raw = Int(value)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x23:
            let raw = Int(value / 10)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x3C:
            let raw = Int((value + 40) * 10)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x42:
            let raw = Int(value * 1000)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x5E:
            let raw = Int(value * 20)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        case 0x05, 0x0F, 0x46, 0x5C:
            return [UInt8(clamping: Int(value + 40))]
        case 0x06, 0x07, 0x08, 0x09:
            return [UInt8(clamping: Int((value + 100) * 1.28))]
        case 0x0E:
            return [UInt8(clamping: Int((value + 64) * 2))]
        case 0x04, 0x11, 0x2C, 0x2F, 0x45, 0x49:
            return [UInt8(clamping: Int(value * 255 / 100))]
        case 0x0A:
            return [UInt8(clamping: Int(value / 3))]
        default:
            if byteCount == 1 { return [UInt8(clamping: Int(value))] }
            let raw = Int(value)
            return [UInt8((raw >> 8) & 0xFF), UInt8(raw & 0xFF)]
        }
    }
}
