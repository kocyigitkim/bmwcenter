import Foundation
import SwiftData
import CoreLocation

@MainActor
final class TripRecorder: ObservableObject {
    @Published private(set) var state: TripState = .idle
    @Published private(set) var live = LiveTripMetrics()

    private let settings: AppSettings
    private let repository: TripRepository
    private let locationProvider: LocationProvider

    private var integration = FuelIntegrationState()
    private var memorySamples: [TripSample] = []
    private var currentTrip: Trip?
    private var speedAboveThresholdSince: Date?
    private var speedBelowSince: Date?
    private var pausedSince: Date?
    private var disconnectedSince: Date?
    private var manualOverrideUntil: Date?
    private var lastSampleAt: Date?
    private var lastFlushAt: Date = .now
    private var movingDurationS: Double = 0
    private var idleDurationS: Double = 0
    private var maxSpeed: Double = 0
    private var maxRpm: Double = 0
    private var startFuelPct: Double?
    private var consumeTask: Task<Void, Never>?

    /// Invoked after a trip is successfully finalized (not discarded).
    var onTripEnded: ((Trip) -> Void)?

    init(settings: AppSettings, repository: TripRepository, locationProvider: LocationProvider) {
        self.settings = settings
        self.repository = repository
        self.locationProvider = locationProvider
    }

    func startListening(to stream: AsyncStream<VehicleSnapshot>, connection: @escaping () -> OBDConnectionState) {
        consumeTask?.cancel()
        consumeTask = Task { [weak self] in
            for await snap in stream {
                guard let self else { return }
                await self.handle(snapshot: snap, connection: connection())
            }
        }
    }

    func stopListening() {
        consumeTask?.cancel()
        consumeTask = nil
        if state.isActive {
            finalizeTrip(discard: false)
        }
    }

    func manualStart() {
        manualOverrideUntil = Date().addingTimeInterval(600)
        beginTrip(manual: true)
    }

    func manualStop() {
        manualOverrideUntil = Date().addingTimeInterval(600)
        finalizeTrip(discard: false)
    }

    func toggle() {
        if state.isActive {
            manualStop()
        } else {
            manualStart()
        }
    }

    private func handle(snapshot: VehicleSnapshot, connection: OBDConnectionState) async {
        let now = Date()
        let rpm = snapshot.rpm ?? 0
        let speed = snapshot.speedKmh ?? 0
        let connected: Bool = {
            if case .connected = connection { return true }
            return false
        }()

        if !connected {
            if disconnectedSince == nil { disconnectedSince = now }
        } else {
            disconnectedSince = nil
        }

        let overrideActive = (manualOverrideUntil ?? .distantPast) > now

        switch state {
        case .idle:
            if !overrideActive && settings.autoRecordTrips && (rpm > 300 || connected) {
                state = .armed
            }
        case .armed:
            if rpm <= 300 && !connected {
                state = .idle
                break
            }
            if speed > settings.startThresholdKmh {
                if speedAboveThresholdSince == nil { speedAboveThresholdSince = now }
                if let since = speedAboveThresholdSince, now.timeIntervalSince(since) >= 3 {
                    beginTrip(manual: false)
                }
            } else {
                speedAboveThresholdSince = nil
            }
        case .recording(let id):
            sample(snapshot: snapshot, now: now)
            if speed < 2 {
                if speedBelowSince == nil { speedBelowSince = now }
                if let since = speedBelowSince, now.timeIntervalSince(since) >= 20 {
                    state = .paused(id)
                    pausedSince = now
                }
            } else {
                speedBelowSince = nil
            }
            checkEndConditions(rpm: rpm, connected: connected, now: now)
        case .paused(let id):
            sample(snapshot: snapshot, now: now)
            if speed > settings.startThresholdKmh {
                state = .recording(id)
                pausedSince = nil
                speedBelowSince = nil
            } else {
                let pauseElapsed = now.timeIntervalSince(pausedSince ?? now)
                let disconnectElapsed = disconnectedSince.map { now.timeIntervalSince($0) } ?? 0
                if pauseElapsed >= settings.stopDelayS || rpm == 0 || disconnectElapsed >= 30 {
                    finalizeTrip(discard: false)
                }
            }
        }

        // Crash-safe periodic flush
        if state.isActive, now.timeIntervalSince(lastFlushAt) > 3 * 3600 {
            flushSamples()
            lastFlushAt = now
        }
    }

    private func beginTrip(manual: Bool) {
        let trip = Trip(isManual: manual, dataSource: "obd")
        repository.context.insert(trip)
        currentTrip = trip
        state = .recording(trip.id)
        integration = FuelIntegrationState()
        memorySamples = []
        movingDurationS = 0
        idleDurationS = 0
        maxSpeed = 0
        maxRpm = 0
        startFuelPct = nil
        lastSampleAt = nil
        speedAboveThresholdSince = nil
        speedBelowSince = nil
        pausedSince = nil
        locationProvider.resetDistance()
        locationProvider.start()
        live = LiveTripMetrics(startedAt: trip.startedAt)
        try? repository.context.save()
        LiveActivityController.shared.start(vehicleName: settings.vehicleName, startedAt: trip.startedAt)
        Log.info("Trip started \(trip.id)")
    }

    private func sample(snapshot: VehicleSnapshot, now: Date) {
        guard let trip = currentTrip else { return }
        if startFuelPct == nil { startFuelPct = snapshot.fuelLevelPct }

        let rate = FuelCalculator.fuelRateLh(
            snapshot: snapshot,
            fuelType: settings.fuelType,
            displacementL: settings.displacementL,
            volumetricEfficiency: settings.volumetricEfficiency,
            calibrationFactor: settings.fuelCalibrationFactor
        )
        let speedFactor = settings.applySpeedCorrection ? settings.speedCalibrationFactor : 1.0
        let speed = (snapshot.speedKmh ?? 0) * speedFactor
        let rpm = snapshot.rpm ?? 0

        integration.integrate(FuelSample(t: now, speedKmh: speed, fuelRateLh: rate))

        if let last = lastSampleAt {
            let dt = now.timeIntervalSince(last)
            if speed >= 2 {
                movingDurationS += dt
            } else {
                idleDurationS += dt
            }
        }
        lastSampleAt = now
        maxSpeed = max(maxSpeed, speed)
        maxRpm = max(maxRpm, rpm)

        if memorySamples.isEmpty || now.timeIntervalSince(memorySamples.last!.t) >= 1 {
            let s = TripSample(
                t: now,
                speedKmh: speed,
                rpm: rpm,
                fuelRateLh: rate ?? 0,
                coolantC: snapshot.coolantC ?? 0,
                throttlePct: snapshot.throttlePct ?? 0,
                boostKpa: snapshot.boostKpa ?? 0
            )
            memorySamples.append(s)
        }

        let duration = now.timeIntervalSince(trip.startedAt)
        let avgSpeed = duration > 0 ? integration.distanceKm / (duration / 3600) : 0
        live = LiveTripMetrics(
            startedAt: trip.startedAt,
            durationS: duration,
            distanceKm: integration.distanceKm,
            fuelUsedL: integration.fuelUsedL,
            avgL100: integration.avgL100,
            avgSpeedKmh: avgSpeed,
            maxSpeedKmh: maxSpeed,
            maxRpm: maxRpm,
            idleDurationS: idleDurationS
        )
        LiveActivityController.shared.update(live: live, speedKmh: speed, score: nil)
    }

    private func checkEndConditions(rpm: Double, connected: Bool, now: Date) {
        // End handled in paused; also if engine dies while moving slowly
        if rpm == 0, (snapshotSpeedNearlyStopped()) {
            finalizeTrip(discard: false)
        }
        if let since = disconnectedSince, now.timeIntervalSince(since) >= 30 {
            finalizeTrip(discard: false)
        }
    }

    private func snapshotSpeedNearlyStopped() -> Bool {
        (live.distanceKm >= 0) && (integration.prev?.speedKmh ?? 0) < 2
    }

    private func finalizeTrip(discard: Bool) {
        guard let trip = currentTrip else {
            state = .idle
            live = LiveTripMetrics()
            return
        }
        let duration = Date().timeIntervalSince(trip.startedAt)
        let shouldDiscard = discard
            || (integration.distanceKm < 0.3 && duration < 60)

        if shouldDiscard {
            repository.context.delete(trip)
            try? repository.context.save()
            Log.info("Trip discarded \(trip.id)")
        } else {
            flushSamples()
            trip.endedAt = Date()
            trip.distanceKm = integration.distanceKm
            trip.durationS = duration
            trip.movingDurationS = movingDurationS
            trip.idleDurationS = idleDurationS
            trip.fuelUsedL = integration.fuelUsedL
            trip.idleFuelL = integration.idleFuelL
            trip.avgSpeedKmh = duration > 0 ? integration.distanceKm / (duration / 3600) : 0
            trip.maxSpeedKmh = maxSpeed
            trip.maxRpm = maxRpm
            trip.avgL100 = integration.avgL100 ?? 0
            trip.startFuelPct = startFuelPct
            if let loc = locationProvider.lastLocation {
                trip.endLatitude = loc.coordinate.latitude
                trip.endLongitude = loc.coordinate.longitude
            }
            let events = (trip.events ?? []).map {
                DetectedEvent(
                    kind: DetectedEvent.Kind(rawValue: $0.typeRaw) ?? .harshAccel,
                    t: $0.t,
                    severity: DetectedEvent.Severity(rawValue: $0.severityRaw) ?? .normal,
                    speedKmh: $0.speedKmh,
                    magnitude: $0.magnitude
                )
            }
            let baseline = repository.monthTrips().map(\.avgL100).filter { FuelCalculator.isValidAvgL100($0) }
            let baselineAvg = baseline.isEmpty ? nil : baseline.reduce(0, +) / Double(baseline.count)
            let breakdown = DrivingScorer.score(
                distanceKm: trip.distanceKm,
                events: events,
                overspeedDurationRatio: 0,
                idleRatio: duration > 0 ? idleDurationS / duration : 0,
                avgL100: trip.avgL100,
                baselineL100: baselineAvg
            )
            trip.scoreTotal = breakdown.total
            trip.scoreBreakdownData = try? JSONEncoder().encode(breakdown)
            try? repository.context.save()
            settings.lastParkingLatitude = trip.endLatitude
            settings.lastParkingLongitude = trip.endLongitude
            settings.lastParkingPlaceName = trip.endPlaceName
            WidgetDataStore.write(
                WidgetSnapshot(
                    fuelLevelPct: trip.endFuelPct ?? startFuelPct,
                    estimatedRangeKm: FuelCalculator.estimatedRangeKm(
                        fuelLevelPct: trip.endFuelPct ?? startFuelPct,
                        tankCapacityL: settings.tankCapacityL,
                        avgL100: trip.avgL100
                    ),
                    lastTripDistanceKm: trip.distanceKm,
                    lastTripDurationS: trip.durationS,
                    lastTripL100: trip.avgL100,
                    lastTripScore: trip.scoreTotal,
                    updatedAt: .now
                )
            )
            Log.info("Trip saved \(trip.id) \(trip.distanceKm) km")
            onTripEnded?(trip)
        }

        currentTrip = nil
        memorySamples = []
        integration = FuelIntegrationState()
        state = .idle
        live = LiveTripMetrics()
        lastSampleAt = nil
        pausedSince = nil
        speedBelowSince = nil
        speedAboveThresholdSince = nil
        LiveActivityController.shared.end()
    }

    private func flushSamples() {
        guard let trip = currentTrip else { return }
        for sample in memorySamples {
            sample.trip = trip
            repository.context.insert(sample)
        }
        if trip.startLatitude == nil, let loc = locationProvider.lastLocation {
            trip.startLatitude = loc.coordinate.latitude
            trip.startLongitude = loc.coordinate.longitude
        }
        try? repository.context.save()
        memorySamples.removeAll(keepingCapacity: true)
    }
}
