import Foundation

/// Discovers and polls VLinker Mode-22 PIDs for the selected vehicle platform.
@MainActor
final class ExtendedPIDSession {
    private(set) var active: [VLinkerPIDDefinition] = []
    private var lastPoll: [String: Date] = [:]
    private var sessionHeader: String?
    private var prepared = false
    private var useSTPXForOil = false
    private var lastRediscover = Date.distantPast
    private(set) var lastError: String?
    /// Rolling raw log for Settings / device debug pull.
    private(set) var debugLines: [String] = []

    func reset() {
        active = []
        lastPoll = [:]
        sessionHeader = nil
        prepared = false
        useSTPXForOil = false
        lastError = nil
        debugLines = []
    }

    func discover(transport: OBDTransport, platform: VehiclePlatform) async {
        let candidates = VLinkerPIDCatalog.extendedPIDs(for: platform)
        guard !candidates.isEmpty else {
            active = []
            return
        }

        lastError = nil
        useSTPXForOil = false
        log("discover platform=\(platform.rawValue) n=\(candidates.count)")

        // This car: Mode01 + Mode22 oil answer on functional 7DF.
        // Physical ATSH7E0 → NO DATA. Dual ECU (7E8+7E9): 7F22 + 62… mixed frames.
        await prepare(transport: transport, header: "7DF")
        _ = try? await transport.send("1003", timeout: 3)
        try? await Task.sleep(nanoseconds: 120_000_000)

        // Prefer working 4402 on this N13; D3B0 often returns only 7F2222.
        let oilOrder = ["bmw.oilTemp.4402", "bmw.oilTemp.D3B0"]
        var oilId: String?
        for id in oilOrder {
            guard let def = candidates.first(where: { $0.id == id }) else { continue }
            await prepare(transport: transport, header: requestHeader(for: def))
            if (await readWithRetries(def, transport: transport, snap: VehicleSnapshot(), retries: 2)) != nil {
                oilId = def.id
                lastPoll[def.id] = Date()
                break
            }
        }
        // Probe extras (boost / rail / EGS trans oil / …). Keep them active even if idle NO DATA.
        var liveExtras: [String] = []
        if oilId != nil {
            for def in candidates where def.metric != .oilTempC {
                await prepare(transport: transport, header: requestHeader(for: def))
                if requestHeader(for: def) == VLinkerPIDCatalog.egsHeader {
                    _ = try? await transport.send("1003", timeout: 2)
                }
                if (await readWithRetries(def, transport: transport, snap: VehicleSnapshot(), retries: 1)) != nil {
                    liveExtras.append(def.id)
                    lastPoll[def.id] = Date()
                }
            }
            active = candidates.filter { def in
                if def.metric == .oilTempC { return def.id == oilId }
                return true
            }
            await restoreFunctionalHeader(transport: transport)
        } else {
            active = []
        }

        if oilId == nil {
            lastError = "Mode22 pending (platform \(platform.rawValue))"
            log("discover none confirmed err=\(lastError ?? "-")")
        } else {
            lastError = nil
            let extras = liveExtras.isEmpty ? "extras=pending" : "extras=\(liveExtras.joined(separator: ","))"
            log("discover ok \(oilId!), \(extras)")
        }
    }

    func pollDue(
        transport: OBDTransport,
        snap: VehicleSnapshot,
        now: Date,
        forceAll: Bool,
        platform: VehiclePlatform
    ) async -> VehicleSnapshot {
        if active.isEmpty,
           platform != .universal,
           forceAll || now.timeIntervalSince(lastRediscover) >= 12 {
            lastRediscover = now
            await discover(transport: transport, platform: platform)
        }

        var out = snap
        guard !active.isEmpty else { return out }

        // BLE budget: at most 2 Mode22 frames per cycle so Mode01 gauges stay live.
        var budget = forceAll ? 4 : 2
        for def in active {
            guard budget > 0 else { break }
            let interval: TimeInterval
            switch def.tier {
            case .fast: interval = 0.5
            case .medium: interval = 2.0
            case .slow: interval = 5.0
            case .rare: interval = 30.0
            }
            let last = lastPoll[def.id] ?? .distantPast
            guard forceAll || now.timeIntervalSince(last) >= interval else { continue }

            let header = requestHeader(for: def)
            await prepare(transport: transport, header: header)
            if header == VLinkerPIDCatalog.egsHeader {
                _ = try? await transport.send("1003", timeout: 2)
            }
            budget -= 1
            if let value = await readWithRetries(def, transport: transport, snap: out, retries: 1) {
                apply(value, metric: def.metric, into: &out)
                lastError = nil
                if let m = def.metric {
                    switch m {
                    case .oilTempC: log(String(format: "oil=%.1f", value))
                    case .transmissionOilTempC: log(String(format: "transOil=%.1f", value))
                    case .boostActualKpa: log(String(format: "boost=%.1fkPa", value))
                    case .boostSetpointKpa: log(String(format: "boostSP=%.1fkPa", value))
                    case .fuelRailBar: log(String(format: "rail=%.1fbar", value))
                    case .oilPressureBar: log(String(format: "oilP=%.2fbar", value))
                    case .coolantC: log(String(format: "coolant22=%.1f", value))
                    case .radiatorOutletC: log(String(format: "rad=%.1f", value))
                    case .intercoolerC: log(String(format: "icat=%.1f", value))
                    case .ambientC: log(String(format: "amb=%.1f", value))
                    case .ignitionAdvanceDeg: log(String(format: "ign=%.1f", value))
                    case .throttlePct: log(String(format: "thr=%.1f", value))
                    case .pedalPct: log(String(format: "ped=%.1f", value))
                    case .mafKgh: log(String(format: "maf=%.1fkg/h", value))
                    case .vanosIntakeDeg: log(String(format: "vanIn=%.1f", value))
                    case .vanosExhaustDeg: log(String(format: "vanEx=%.1f", value))
                    case .lowPressureFuelBar: log(String(format: "lpfp=%.2f", value))
                    case .alternatorVoltage: log(String(format: "alt=%.2fV", value))
                    case .batterySocPct: log(String(format: "soc=%.0f%%", value))
                    }
                }
                lastPoll[def.id] = now
            } else {
                lastPoll[def.id] = now
            }
        }
        // Mode 01 stays on functional broadcast.
        if sessionHeader != "7DF" {
            await restoreFunctionalHeader(transport: transport)
        }
        return out
    }

    /// DME Mode22 → functional 7DF. EGS → 7E1. IBS/alternator → gateway 6F1.
    private func requestHeader(for def: VLinkerPIDDefinition) -> String {
        guard case .mode22(_, let header) = def.kind else { return "7DF" }
        switch header {
        case VLinkerPIDCatalog.egsHeader: return VLinkerPIDCatalog.egsHeader
        case VLinkerPIDCatalog.gatewayHeader: return VLinkerPIDCatalog.gatewayHeader
        default: return "7DF"
        }
    }

    var hasOilTemp: Bool { active.contains { $0.metric == .oilTempC } }
    var hasOilPressure: Bool { active.contains { $0.metric == .oilPressureBar } }

    private func prepare(transport: OBDTransport, header: String) async {
        if !prepared {
            // Prefer already-negotiated protocol from Mode01; only force SP6 if unknown.
            if let dpn = try? await transport.send("ATDPN", timeout: 2) {
                log("ATDPN \(compact(dpn))")
                let n = dpn.uppercased().filter(\.isHexDigit)
                if !(n.contains("6") || n.contains("A") || n.contains("7")) {
                    _ = try? await transport.send(ELM327Commands.protocolCAN11_500, timeout: 2)
                }
            } else {
                _ = try? await transport.send(ELM327Commands.protocolCAN11_500, timeout: 2)
            }
            _ = try? await transport.send("ATAL", timeout: 1)
            _ = try? await transport.send("ATE0", timeout: 1)
            _ = try? await transport.send("ATH0", timeout: 1)
            _ = try? await transport.send("ATAR", timeout: 1)
            _ = try? await transport.send("ATSTFF", timeout: 1)
            if let sti = try? await transport.send("STI", timeout: 2) {
                log("STI \(compact(sti))")
            }
            prepared = true
            try? await Task.sleep(nanoseconds: 150_000_000)
            log("prepared AL/ATH0/ATAR/ATSTFF")
        }
        if sessionHeader != header {
            _ = try? await transport.send("ATSH\(header)", timeout: 2)
            sessionHeader = header
            try? await Task.sleep(nanoseconds: 120_000_000)
            log("header ATSH\(header)")
        }
    }

    private func restoreFunctionalHeader(transport: OBDTransport) async {
        _ = try? await transport.send("ATAR", timeout: 1)
        _ = try? await transport.send("ATSH7DF", timeout: 1)
        sessionHeader = "7DF"
    }

    private func readWithRetries(
        _ def: VLinkerPIDDefinition,
        transport: OBDTransport,
        snap: VehicleSnapshot,
        retries: Int
    ) async -> Double? {
        for attempt in 0..<retries {
            if let value = await read(def, transport: transport, into: snap) {
                return value
            }
            if attempt + 1 < retries {
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
        return nil
    }

    private func read(
        _ def: VLinkerPIDDefinition,
        transport: OBDTransport,
        into snap: VehicleSnapshot
    ) async -> Double? {
        do {
            let response = try await transport.send(def.command, timeout: 3.5)
            let preview = compact(response)
            switch def.kind {
            case .mode01(let pid):
                let parsed = OBDFrameParser.parse(
                    response: response,
                    expectedPID: pid,
                    byteCount: def.byteCount
                )
                guard case .value(let bytes) = parsed else {
                    lastError = "\(def.id): \(preview)"
                    log("fail \(def.id) \(preview)")
                    return nil
                }
                return def.parse(bytes, snap)
            case .mode22(let did, _):
                // Multi-ECU bus: one module may 7F22 while DME returns 62… — prefer payload.
                guard let bytes = OBDFrameParser.parseMode22(response: response, did: did) else {
                    if response.uppercased().contains("7F22") {
                        lastError = "\(def.id): neg \(preview)"
                        log("neg \(def.id) \(preview)")
                    } else {
                        lastError = "\(def.id): \(preview)"
                        log("fail \(def.id) \(preview)")
                    }
                    return nil
                }
                if let value = def.parse(bytes, snap) {
                    log("ok \(def.id) raw=\(bytes.map { String(format: "%02X", $0) }.joined()) val=\(value)")
                    return value
                }
                lastError = "\(def.id): parse fail bytes=\(bytes.map { String(format: "%02X", $0) }.joined())"
                log(lastError ?? "")
                return nil
            }
        } catch {
            lastError = "\(def.id): timeout/err"
            log("timeout \(def.id)")
            return nil
        }
    }

    private func compact(_ response: String) -> String {
        String(
            response
                .replacingOccurrences(of: "\r", with: " ")
                .replacingOccurrences(of: "\n", with: " ")
                .prefix(72)
        )
    }

    private func log(_ line: String) {
        let stamped = "M22 \(line)"
        debugLines.append(stamped)
        if debugLines.count > 40 { debugLines.removeFirst(debugLines.count - 40) }
        // NSLog always shows in Device Console / devicectl --console
        NSLog("%@", "VLINKER \(stamped)")
    }

    private func apply(_ value: Double, metric: SnapshotMetric?, into snap: inout VehicleSnapshot) {
        guard let metric else { return }
        switch metric {
        case .oilTempC: snap.oilTempC = value
        case .transmissionOilTempC: snap.transmissionOilTempC = value
        case .oilPressureBar: snap.oilPressureBar = value
        case .boostSetpointKpa: snap.boostSetpointKpa = value
        case .boostActualKpa: snap.boostActualKpa = value
        case .fuelRailBar:
            snap.fuelRailBar = value
            snap.fuelRailKpa = value * 100.0
        case .coolantC: snap.coolantC = value
        case .radiatorOutletC: snap.radiatorOutletC = value
        case .intercoolerC: snap.intercoolerC = value
        case .ambientC: snap.ambientC = value
        case .ignitionAdvanceDeg:
            snap.timingAdvance = value
        case .throttlePct: snap.throttlePct = value
        case .pedalPct: snap.pedalPct = value
        case .mafKgh:
            snap.mafKgh = value
            snap.mafGs = value / 3.6 // kg/h → g/s
        case .vanosIntakeDeg: snap.vanosIntakeDeg = value
        case .vanosExhaustDeg: snap.vanosExhaustDeg = value
        case .lowPressureFuelBar: snap.lowPressureFuelBar = value
        case .alternatorVoltage:
            snap.alternatorVoltage = value
            snap.voltage = value
        case .batterySocPct: snap.batterySocPct = value
        }
    }
}
