import XCTest
import SwiftData
@testable import QuickCar

/// Real-drive traces (Istanbul commute / TEM highway / summer climb), not UI microbenchmarks.
/// Each case asserts product correctness, then that a 1 Hz replay finishes quickly.
@MainActor
final class DrivingScenarioBenchmarkTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_720_000_000)

    private func careContext() -> ModelContext {
        let schema = Schema([
            BaselineMetric.self, ProtectionEvent.self, CrankRecord.self,
            ThermalEvent.self, MaintenanceLedger.self, Trip.self
        ])
        let container = try! ModelContainer(
            for: schema,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    private func turboProfile() -> VehicleDiagnosticProfile {
        VehicleArchetypeDefaults.profile(for: .gasolineTurboDI, fuel: .gasoline, isTurbo: true)
    }

    private func snapshot(
        at offset: TimeInterval,
        rpm: Double,
        speed: Double,
        coolant: Double,
        voltage: Double = 14.2,
        load: Double = 30,
        fuelRate: Double? = nil,
        fuelPct: Double = 55,
        ambient: Double = 22,
        stft: Double = 2,
        ltft: Double = 3,
        maf: Double? = nil
    ) -> VehicleSnapshot {
        var s = VehicleSnapshot()
        s.timestamp = t0.addingTimeInterval(offset)
        s.rpm = rpm
        s.speedKmh = speed
        s.coolantC = coolant
        s.voltage = voltage
        s.engineLoadPct = load
        s.engineFuelRateLh = fuelRate
        s.mafGs = maf
        s.fuelLevelPct = fuelPct
        s.ambientC = ambient
        s.stftBank1 = stft
        s.ltftBank1 = ltft
        s.runtimeS = offset
        s.baroKpa = 101.3
        s.mapKpa = 101.3
        s.intakeAirC = max(ambient, 15)
        s.throttlePct = min(100, load)
        return s
    }

    /// Kadıköy, ~5 °C February morning: coolant crawls 8 → 40 °C over 8 min at idle.
    func testColdMorningIstanbulWinter() {
        let ctx = careContext()
        let watchdog = OverheatWatchdog(baseline: BaselineLearner(modelContext: ctx), modelContext: ctx)
        let shield = ColdEngineShield(modelContext: ctx)
        let ready = EngineReadyService()
        var context = CareContext(now: t0)
        context.profile = turboProfile()
        context.ambientC = 5
        context.effectiveAmbientC = 5
        context.confidenceTier = .t1

        var cues: [CareCue] = []
        let start = CFAbsoluteTimeGetCurrent()
        for sec in 0...480 {
            let p = Double(sec) / 480.0
            let coolant = 8.0 + 32.0 * p
            let rpm: Double = sec < 3 ? 400 + Double(sec) * 300 : 850
            let snap = snapshot(
                at: Double(sec), rpm: rpm, speed: 0, coolant: coolant,
                voltage: sec < 2 ? 11.2 : 14.1, load: 18, ambient: 5
            )
            context.now = t0.addingTimeInterval(Double(sec))
            cues += watchdog.evaluate(snapshot: snap, context: &context)
            cues += shield.evaluate(snapshot: snap, context: &context)
            cues += ready.evaluate(snapshot: snap, context: &context)
        }
        let elapsed = CFAbsoluteTimeGetCurrent() - start

        XCTAssertFalse(cues.contains { $0.id == "overheat.alarm" || $0.id == "overheat.critical" || $0.id == "overheat.fan" })
        XCTAssertLessThan(ready.readiness, 0.7, "8 min at 40 °C coolant is not fully warmed")
        XCTAssertTrue(context.isColdPhase)
        XCTAssertLessThan(elapsed, 1.5, "cold-start 8 min @ 1 Hz took \(elapsed)s")
    }

    /// TEM / O-4 cruise at 120 km/h: stable speed/RPM, instant L/100 in a 5–12 band, distance accumulates.
    func testHighwayCruise120() {
        var fuel = FuelIntegrationState()
        var l100s: [Double] = []
        let start = CFAbsoluteTimeGetCurrent()
        for sec in 0...600 {
            let rpm = 2_350 + 40 * sin(Double(sec) / 12)
            let speed = 120.0 + 1.5 * sin(Double(sec) / 18)
            let rate = 7.8 + 0.3 * sin(Double(sec) / 20)
            let snap = snapshot(
                at: Double(sec), rpm: rpm, speed: speed, coolant: 92,
                load: 42, fuelRate: rate
            )
            let instant = FuelCalculator.instantL100(fuelRateLh: rate, speedKmh: speed)
            if let v = instant.l100 { l100s.append(v) }
            XCTAssertNil(instant.idleLh)
            fuel.integrate(FuelSample(t: snap.timestamp, speedKmh: speed, fuelRateLh: rate))
        }
        let elapsed = CFAbsoluteTimeGetCurrent() - start

        XCTAssertEqual(fuel.distanceKm, 20.0, accuracy: 0.6)
        XCTAssertEqual(fuel.fuelUsedL, 7.8 * 600 / 3600, accuracy: 0.25)
        let meanL100 = l100s.reduce(0, +) / Double(l100s.count)
        XCTAssertGreaterThan(meanL100, 5)
        XCTAssertLessThan(meanL100, 12)
        XCTAssertEqual(meanL100, 7.8 / 120 * 100, accuracy: 0.8)
        XCTAssertLessThan(elapsed, 0.5, "highway 10 min integrate took \(elapsed)s")
    }

    /// Beşiktaş–Levent stop-and-go: idle L/h vs moving L/100; eco score stays in 0...100.
    func testStopAndGoTraffic() {
        let eco = EcoCoach()
        var context = CareContext(now: t0)
        context.isColdPhase = false
        context.profile = turboProfile()
        var fuel = FuelIntegrationState()
        var idleRates: [Double] = []
        var movingL100: [Double] = []

        let start = CFAbsoluteTimeGetCurrent()
        for sec in 0...300 {
            let stopped = (sec % 40) < 18
            let speed: Double = stopped ? 0 : 28
            let rpm: Double = stopped ? 780 : 1_600
            let rate: Double = stopped ? 1.1 : 3.6
            let snap = snapshot(
                at: Double(sec), rpm: rpm, speed: speed, coolant: 90,
                load: stopped ? 16 : 35, fuelRate: rate
            )
            let instant = FuelCalculator.instantL100(fuelRateLh: rate, speedKmh: speed)
            if stopped {
                XCTAssertNil(instant.l100)
                if let idle = instant.idleLh { idleRates.append(idle) }
            } else {
                XCTAssertNil(instant.idleLh)
                if let v = instant.l100 { movingL100.append(v) }
            }
            context.now = snap.timestamp
            _ = eco.evaluate(snapshot: snap, context: &context)
            fuel.integrate(FuelSample(t: snap.timestamp, speedKmh: speed, fuelRateLh: rate))
        }
        let elapsed = CFAbsoluteTimeGetCurrent() - start

        XCTAssertEqual(idleRates.first ?? 0, 1.1, accuracy: 0.01)
        let meanMoving = movingL100.reduce(0, +) / Double(max(movingL100.count, 1))
        XCTAssertEqual(meanMoving, 3.6 / 28 * 100, accuracy: 0.5)
        XCTAssertGreaterThan(context.liveEcoScore, 40)
        XCTAssertLessThanOrEqual(context.liveEcoScore, 100)
        XCTAssertGreaterThan(fuel.idleFuelL, 0)
        XCTAssertGreaterThan(fuel.distanceKm, 0.8)
        XCTAssertLessThan(elapsed, 0.8, "stop-and-go 5 min took \(elapsed)s")
    }

    /// Summer climb: coolant crosses the 90 °C thermostat, then OverheatWatchdog critical; TLI asks for idle.
    func testHotClimbOverheat() {
        let ctx = careContext()
        let watchdog = OverheatWatchdog(baseline: BaselineLearner(modelContext: ctx), modelContext: ctx)
        let thermal = ThermalShockGuard(modelContext: ctx)
        var context = CareContext(now: t0)
        context.profile = turboProfile()
        context.confidenceTier = .t1
        context.canHealthy = true

        var all: [CareCue] = []
        // Leave post-start grace with a plausible climb (≤ 3 °C/s).
        var coolant = 40.0
        var t: TimeInterval = 0
        while coolant < 96 {
            t += 1
            coolant = min(96, coolant + 2.0)
            var snap = snapshot(at: t, rpm: 2_800, speed: 55, coolant: coolant, load: 85)
            snap.boostActualKpa = 180
            snap.baroKpa = 101
            context.now = t0.addingTimeInterval(t)
            all += watchdog.evaluate(snapshot: snap, context: &context)
            all += thermal.evaluate(snapshot: snap, context: &context)
        }
        let crossedThermostatAt = t
        XCTAssertGreaterThan(crossedThermostatAt, 20)

        while coolant < 119 {
            t += 1
            coolant = min(119, coolant + 0.8)
            var snap = snapshot(at: t, rpm: 3_200, speed: 40, coolant: coolant, load: 90)
            snap.pedalPct = 80
            context.now = t0.addingTimeInterval(t)
            all += watchdog.evaluate(snapshot: snap, context: &context)
        }
        // Hold critical 3s confirm window.
        for _ in 0..<5 {
            t += 1
            context.now = t0.addingTimeInterval(t)
            all += watchdog.evaluate(
                snapshot: snapshot(at: t, rpm: 3_000, speed: 35, coolant: 119, load: 88),
                context: &context
            )
        }

        XCTAssertTrue(
            all.contains { $0.id == "overheat.critical" || $0.id == "overheat.alarm" },
            "hot climb past ~117 °C must raise overheat after thermostat open (t=\(t)s)"
        )
        XCTAssertGreaterThan(ThermalShockGuard.recommendedIdle(tli: 1.1), 70)
    }

    /// Car sat overnight at 12.1 V; next start vs a healthy 14.2 V running charge.
    func testOvernightParkedWeakBattery() {
        let weak = BatteryGuardian(modelContext: careContext())
        var ctx = CareContext(now: t0)
        ctx.profile = turboProfile()
        var rest = snapshot(at: 0, rpm: 0, speed: 0, coolant: 12, voltage: 12.10, load: 0, ambient: 8)
        for i in 0..<8 {
            ctx.now = t0.addingTimeInterval(Double(i))
            rest.timestamp = ctx.now
            _ = weak.evaluate(snapshot: rest, context: &ctx)
        }
        var crank = rest
        crank.rpm = 850
        crank.voltage = 12.05
        ctx.now = t0.addingTimeInterval(8)
        let cues = weak.evaluate(snapshot: crank, context: &ctx)
        XCTAssertTrue(cues.contains { $0.id == "battery.deep" })

        XCTAssertEqual(BatteryHealthAnalyzer.classify(minVoltage: 12.1, ambientC: 20), .good)
        var running = snapshot(at: 20, rpm: 1_800, speed: 0, coolant: 40, voltage: 14.2, load: 25)
        XCTAssertFalse(rule("voltage.charging").evaluate(running, VehicleProfileSnapshot()))
        running.voltage = 12.8
        XCTAssertTrue(rule("voltage.charging").evaluate(running, VehicleProfileSnapshot()))
    }

    /// P0171-style lean: STFT+LTFT high positive, DTC decodes, trim monitor stays quiet until 3 long trips.
    func testLeanMisfireP0171() async throws {
        let codes = OBDFrameParser.parseDTCResponse("43 01 71")
        XCTAssertEqual(codes.first?.code, "P0171")

        let fixture = ReplayFixture(name: "lean-p0171", frames: [
            ReplayFrame(request: "03", response: "43 01 71 00 00"),
            ReplayFrame(request: "0106", response: "41 06 9C"), // STFT ≈ 21.9%
            ReplayFrame(request: "0107", response: "41 07 9A")  // LTFT ≈ 20.3%
        ])
        let transport = ReplayTransport(fixture: fixture)
        var iterator = transport.discoveredAdapters.makeAsyncIterator()
        await transport.startScan()
        let adapters = await iterator.next()
        try await transport.connect(peripheralID: adapters!.first!.id)
        let dtcLine = try await transport.send("03", timeout: 1)
        XCTAssertEqual(OBDFrameParser.parseDTCResponse(dtcLine).first?.code, "P0171")

        let stftBytes = OBDFrameParser.parse(response: try await transport.send("0106", timeout: 1), expectedPID: 0x06, byteCount: 1)
        let ltftBytes = OBDFrameParser.parse(response: try await transport.send("0107", timeout: 1), expectedPID: 0x07, byteCount: 1)
        guard case .value(let stftRaw) = stftBytes, case .value(let ltftRaw) = ltftBytes else {
            return XCTFail("expected trim bytes")
        }
        let stft = OBDPIDCatalog.stft1.parse(stftRaw) ?? 0
        let ltft = OBDPIDCatalog.ltft1.parse(ltftRaw) ?? 0
        XCTAssertGreaterThan(stft + ltft, 20)

        let ctx = careContext()
        let monitor = FuelTrimMonitor(baseline: BaselineLearner(modelContext: ctx), modelContext: ctx)
        var care = CareContext(now: t0)
        care.profile = turboProfile()
        care.lastRefuelAt = t0.addingTimeInterval(-800)

        func feedTrip(start: TimeInterval) -> [CareCue] {
            var cues: [CareCue] = []
            for i in 0..<20 {
                care.now = t0.addingTimeInterval(start + Double(i))
                var idle = snapshot(at: start + Double(i), rpm: 800, speed: 0, coolant: 92, load: 18, stft: stft, ltft: ltft)
                idle.fuelLevelPct = 40
                cues += monitor.evaluate(snapshot: idle, context: &care)
                var part = snapshot(at: start + Double(i) + 0.5, rpm: 1_800, speed: 45, coolant: 92, load: 40, stft: stft, ltft: ltft)
                part.fuelLevelPct = 40
                care.now = part.timestamp
                cues += monitor.evaluate(snapshot: part, context: &care)
            }
            return cues
        }

        XCTAssertTrue(feedTrip(start: 0).isEmpty, "trim alerts only after repeated trips")

        var endCues: [CareCue] = []
        for n in 0..<3 {
            if n > 0 { _ = feedTrip(start: Double(n) * 500) }
            let trip = Trip(id: UUID(), startedAt: t0.addingTimeInterval(Double(n) * 500))
            trip.durationS = 500
            endCues += monitor.onTripEnded(trip: trip, context: care)
        }
        XCTAssertTrue(endCues.contains { $0.id == "trim.drift" })
        XCTAssertEqual(
            VehicleScanClassifier.classify(dtcs: [DTC(code: "P0171", status: .stored)], readiness: nil),
            .attention
        )
    }

    /// Mode 22 oil / boost / rail are OEM pack sensors. Daily factory still excludes VANOS and rail.
    func testBMWExtendedSensorsDailyExcludesOEM() async throws {
        let fixture = ReplayFixture(name: "bmw-mode22-oem-pack", frames: [
            ReplayFrame(request: "22D3B0", response: "62 D3 B0 82"),       // 90 °C oil
            ReplayFrame(request: "222C10", response: "62 2C 10 07 08"),    // 180.0 kPa charge
            ReplayFrame(request: "222B0D", response: "62 2B 0D 01 F4")     // 50.0 bar rail
        ])
        let transport = ReplayTransport(fixture: fixture)
        var iterator = transport.discoveredAdapters.makeAsyncIterator()
        await transport.startScan()
        try await transport.connect(peripheralID: (await iterator.next())!.first!.id)

        let oilBytes = OBDFrameParser.parseMode22(response: try await transport.send("22D3B0", timeout: 1), did: 0xD3B0)
        XCTAssertEqual(OBDFrameParser.bmwOilTempC(fromMode22Bytes: oilBytes ?? []) ?? -1, 90, accuracy: 0.1)

        let boostBytes = OBDFrameParser.parseMode22(response: try await transport.send("222C10", timeout: 1), did: 0x2C10)
        XCTAssertEqual(boostBytes, [0x07, 0x08])
        var snap = VehicleSnapshot()
        snap.boostActualKpa = 180
        snap.baroKpa = 101.3
        XCTAssertEqual(snap.boostKpa ?? 0, 78.7, accuracy: 0.2)

        let railBytes = OBDFrameParser.parseMode22(response: try await transport.send("222B0D", timeout: 1), did: 0x2B0D)
        XCTAssertEqual(railBytes, [0x01, 0xF4])

        let daily = Set(DashboardLayout.factory(for: .daily).items.map(\.id))
        XCTAssertFalse(daily.contains(.vanosIntake))
        XCTAssertFalse(daily.contains(.vanosExhaust))
        XCTAssertFalse(daily.contains(.fuelRail))
        XCTAssertFalse(daily.contains(where: \.isExtendedOEM))
        XCTAssertTrue(DashboardLayout.factory(for: .performance).items.contains { $0.id == .fuelRail })
    }

    /// Fill-up: 18% of a 55 L tank vs 95% after the pump, using a 7.5 L/100 cruise average.
    func testRefuelAndRange() {
        let tank = 55.0
        let avg = 7.5
        let before = FuelCalculator.estimatedRangeKm(fuelLevelPct: 18, tankCapacityL: tank, avgL100: avg)
        XCTAssertEqual(before ?? 0, 0.18 * tank / avg * 100, accuracy: 0.2)
        XCTAssertEqual(before ?? 0, 132, accuracy: 1)

        let after = FuelCalculator.estimatedRangeKm(fuelLevelPct: 95, tankCapacityL: tank, avgL100: avg)
        XCTAssertEqual(after ?? 0, 0.95 * tank / avg * 100, accuracy: 0.2)
        XCTAssertGreaterThan(after ?? 0, before ?? 0)
        XCTAssertEqual(FuelCalculator.cost(fuelUsedL: 42.35, pricePerLiter: 48.5), 42.35 * 48.5, accuracy: 0.01)
        XCTAssertNil(FuelCalculator.estimatedRangeKm(fuelLevelPct: 50, tankCapacityL: tank, avgL100: nil))
    }

    func testDashboardLayoutOpsAndPersist() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        let store = DashboardLayoutStore()
        var layout = DashboardLayout.factory(for: .daily)
        layout.applyPreset(.performance)
        XCTAssertEqual(layout.preset, .performance)
        XCTAssertTrue(layout.items.contains { $0.id == .fuelRail })
        layout.hide(.fuelRail)
        layout.move(.iat, offset: -1)
        layout.add(.voltage)
        store.save(layout, to: settings)

        let loaded = store.load(from: AppSettings(defaults: defaults))
        XCTAssertTrue(loaded.isCustomized)
        XCTAssertEqual(loaded.preset, .performance)
        XCTAssertFalse(loaded.items.contains { $0.id == .fuelRail })
        XCTAssertTrue(loaded.items.contains { $0.id == .voltage })
    }

    func testScenarioReplayClockBudget() {
        measure(metrics: [XCTClockMetric()]) {
            var fuel = FuelIntegrationState()
            for sec in 0...600 {
                fuel.integrate(
                    FuelSample(
                        t: self.t0.addingTimeInterval(Double(sec)),
                        speedKmh: 120,
                        fuelRateLh: 7.8
                    )
                )
            }
            _ = fuel.distanceKm
        }
    }

    private func rule(_ id: String) -> AlertRule {
        AlertRules.builtIn.first { $0.id == id }!
    }
}
