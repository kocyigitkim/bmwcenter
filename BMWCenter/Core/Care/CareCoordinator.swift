import Foundation
import SwiftData
import Combine
import UIKit
import CoreLocation

@MainActor
final class CareCoordinator: ObservableObject {
    @Published private(set) var activeChips: [ActiveAlert] = []
    @Published private(set) var readiness: Double = 0
    @Published private(set) var isEngineReady = false
    @Published private(set) var readinessLabel: String?
    @Published private(set) var liveEcoScore: Double = 100
    @Published private(set) var oilTempC: Double?
    @Published private(set) var oilIsEstimated = true
    @Published private(set) var thermalCountdownS: Double?
    @Published private(set) var tripCardImage: UIImage?
    @Published private(set) var showTripCard = false

    let baseline: BaselineLearner
    let scheduler: CueScheduler
    let engineReady: EngineReadyService
    let coldShield: ColdEngineShield
    let overheat: OverheatWatchdog
    let thermal: ThermalShockGuard
    let battery: BatteryGuardian
    let eco: EcoCoach
    let gear: GearCoach
    let challenges: ChallengeEngine
    let streak: StreakService
    let badges: BadgeService
    let trim: FuelTrimMonitor
    let thermostat: ThermostatWatch
    let maintenance: AdaptiveMaintenance
    let cardRenderer = TripSummaryCardRenderer()

    private let settings: AppSettings
    private let modelContext: ModelContext
    private var features: [CareFeature] = []
    private var listenTask: Task<Void, Never>?
    private var context = CareContext()
    private var cleanWarmups = 0
    private var tripCount = 0

    init(settings: AppSettings, modelContext: ModelContext, announcer: AudioAnnouncer) {
        self.settings = settings
        self.modelContext = modelContext
        self.baseline = BaselineLearner(modelContext: modelContext)
        self.scheduler = CueScheduler(announcer: announcer)
        self.engineReady = EngineReadyService()
        self.coldShield = ColdEngineShield(modelContext: modelContext)
        self.overheat = OverheatWatchdog(baseline: baseline, modelContext: modelContext)
        self.thermal = ThermalShockGuard(modelContext: modelContext)
        self.battery = BatteryGuardian(modelContext: modelContext)
        self.eco = EcoCoach()
        self.gear = GearCoach()
        self.challenges = ChallengeEngine(modelContext: modelContext, coldShield: coldShield)
        self.streak = StreakService(modelContext: modelContext)
        self.badges = BadgeService(modelContext: modelContext)
        self.trim = FuelTrimMonitor(baseline: baseline, modelContext: modelContext)
        self.thermostat = ThermostatWatch(baseline: baseline, modelContext: modelContext)
        self.maintenance = AdaptiveMaintenance(baseline: baseline, modelContext: modelContext)

        features = [
            coldShield, engineReady, overheat, thermal, battery,
            eco, gear, challenges, trim, thermostat, maintenance
        ]

        scheduler.onPresented = { [weak self] cue, plan in
            guard let self else { return }
            if plan.phoneChip {
                let alert = ActiveAlert(
                    id: cue.id,
                    title: cue.chipTitle ?? cue.text,
                    severity: SeverityRouter.alertSeverity(from: cue.severity)
                )
                if !self.activeChips.contains(where: { $0.id == alert.id }) {
                    self.activeChips.insert(alert, at: 0)
                    if self.activeChips.count > 6 {
                        self.activeChips = Array(self.activeChips.prefix(6))
                    }
                }
            }
        }
        applyCueFrequency()
    }

    func startListening(to snapshots: AsyncStream<VehicleSnapshot>, supportedPIDs: @escaping () -> Set<UInt8>) {
        listenTask?.cancel()
        listenTask = Task { [weak self] in
            var lastEval = Date.distantPast
            for await snap in snapshots {
                guard let self else { break }
                let now = Date()
                guard now.timeIntervalSince(lastEval) >= 1.0 else { continue }
                lastEval = now
                await MainActor.run {
                    self.evaluate(snapshot: snap, supportedPIDs: supportedPIDs(), now: now)
                }
            }
        }
    }

    func stop() {
        listenTask?.cancel()
        listenTask = nil
    }

    func evaluate(snapshot: VehicleSnapshot, supportedPIDs: Set<UInt8>, now: Date = .now) {
        applyCueFrequency()
        maintenance.airflowEnabled = settings.careAirflowWatch

        // Oil temperature: measured OBD PID only — no estimation in UI or Care context.
        oilTempC = snapshot.oilTempC
        oilIsEstimated = snapshot.oilTempC == nil

        context.now = now
        context.supportedPIDs = supportedPIDs
        context.ambientC = snapshot.ambientC ?? context.ambientC
        context.oilTempC = snapshot.oilTempC
        context.oilIsEstimated = snapshot.oilTempC == nil
        context.fuelType = settings.fuelType
        context.isTurbo = settings.isTurbo
        context.sensitivityOffsetC = sensitivityOffset()
        context.isVehicleStopped = (snapshot.speedKmh ?? 0) < 2
        context.tripDistanceKm = 0
        context.lastRefuelAt = nil

        var allCues: [CareCue] = []
        for feature in features {
            guard feature.isEnabled(settings: settings) else { continue }
            if !feature.isAvailable(supportedPIDs: supportedPIDs), !supportedPIDs.isEmpty {
                continue
            }
            allCues.append(contentsOf: feature.evaluate(snapshot: snapshot, context: &context))
        }

        readiness = engineReady.readiness
        isEngineReady = engineReady.isReady
        readinessLabel = engineReady.remainingLabel
        liveEcoScore = eco.liveScore
        thermalCountdownS = thermal.countdownSeconds

        if settings.careSpokenCues {
            scheduler.enqueueAll(allCues, now: now)
        } else {
            // Still surface critical/protective chips
            for cue in allCues where cue.severity >= .protective {
                scheduler.enqueue(cue, now: now)
            }
        }
    }

    func onTripEnded(_ trip: Trip) {
        context.tripDistanceKm = trip.distanceKm
        context.tripDurationS = trip.durationS
        context.isVehicleStopped = true

        var endCues: [CareCue] = []
        for feature in features {
            guard feature.isEnabled(settings: settings) else { continue }
            endCues.append(contentsOf: feature.onTripEnded(trip: trip, context: context))
        }
        scheduler.enqueueAll(endCues, now: .now)

        let hadViolation = coldShield.coldViolationsThisTrip > 0
        if !hadViolation { cleanWarmups += 1 }
        tripCount += 1
        streak.recordDay(
            score: trip.scoreTotal ?? 0,
            hadProtectionViolation: hadViolation
        )
        _ = badges.evaluateAwards(
            isStopped: true,
            cleanWarmups: cleanWarmups,
            compliantCooldowns: 0,
            harshAccelKm: 0,
            tripCount: tripCount,
            longHaulKm: trip.distanceKm,
            thermostatCaught: thermostat.caughtFault
        )

        let cleanWarmup = !hadViolation
        if settings.careTripSummaryCard, cardRenderer.shouldRender(distanceKm: trip.distanceKm) {
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await self?.presentTripCard(trip, cleanWarmup: cleanWarmup)
            }
        }

        coldShield.resetTrip()
        engineReady.resetTrip()
        eco.resetTrip()
    }

    func resetBaselines() {
        baseline.reset()
    }

    private func presentTripCard(_ trip: Trip, cleanWarmup: Bool) {
        let harsh = (trip.events ?? []).filter { $0.typeRaw == "harshBrake" }.count
        var start: CLLocationCoordinate2D?
        if let lat = trip.startLatitude, let lon = trip.startLongitude {
            start = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        var end: CLLocationCoordinate2D?
        if let lat = trip.endLatitude, let lon = trip.endLongitude {
            end = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        let model = TripSummaryCardRenderer.CardModel(
            vehicleName: settings.vehicleName,
            date: trip.endedAt ?? trip.startedAt,
            distanceKm: trip.distanceKm,
            durationS: trip.durationS,
            avgL100: trip.avgL100,
            cost: trip.fuelUsedL * settings.pricePerLiter,
            currencyCode: settings.currencyCode,
            score: trip.scoreTotal,
            bestStretchKm: nil,
            bestStretchL100: nil,
            cleanWarmup: cleanWarmup,
            properCooldown: true,
            harshBrakes: harsh,
            startCoord: start,
            endCoord: end,
            hideLocation: settings.careHideLocationSharing
        )
        tripCardImage = cardRenderer.renderImage(model: model)
        showTripCard = tripCardImage != nil
    }

    private func sensitivityOffset() -> Double {
        switch settings.careSensitivity {
        case "early": return -2
        case "calm": return 2
        default: return 0
        }
    }

    private func applyCueFrequency() {
        switch settings.careCueFrequency {
        case "low": scheduler.updateFrequency(1.5)
        case "high": scheduler.updateFrequency(0.7)
        default: scheduler.updateFrequency(1.0)
        }
    }
}
