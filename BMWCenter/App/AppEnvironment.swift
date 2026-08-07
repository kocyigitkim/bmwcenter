import Foundation
import SwiftData
import SwiftUI
import Combine

@MainActor
final class AppEnvironment: ObservableObject {
    static let shared = AppEnvironment()

    let settings: AppSettings
    let container: ModelContainer
    let obd: OBDService
    let tripRecorder: TripRecorder
    let locationProvider: LocationProvider
    let tripRepository: TripRepository
    let fuelStatistics: FuelStatistics
    let fuelRepository: FuelRepository
    let fuelCalibrator: FuelCalibrator
    let speedCalibrator: SpeedCalibrator
    let alertEngine: AlertEngine
    let audioAnnouncer: AudioAnnouncer
    let maintenanceService: MaintenanceService
    let liveActivity: LiveActivityController
    let cloudSync: CloudSyncController
    let watchBridge: PhoneWatchBridge
    let eventDetector: EventDetector
    let care: CareCoordinator
    let dtcMonitor: DTCMonitor

    private var started = false
    private var widgetTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    private init() {
        let settings = AppSettings()
        let container = StorageStack.makeContainer()
        let context = ModelContext(container)
        let repo = TripRepository(modelContext: context, settings: settings)
        let fuelRepo = FuelRepository(modelContext: context)
        let location = LocationProvider()
        let obd = OBDService(settings: settings)
        let recorder = TripRecorder(settings: settings, repository: repo, locationProvider: location)
        let fuelStats = FuelStatistics(modelContext: context, settings: settings)
        let announcer = AudioAnnouncer(settings: settings)
        let alerts = AlertEngine(settings: settings, announcer: announcer)
        let maint = MaintenanceService(modelContext: context, settings: settings)
        let watch = PhoneWatchBridge(settings: settings)
        let care = CareCoordinator(settings: settings, modelContext: context, announcer: announcer)
        let dtcMonitor = DTCMonitor(
            obd: obd,
            settings: settings,
            alertEngine: alerts,
            modelContext: context
        )

        self.settings = settings
        self.container = container
        self.obd = obd
        self.tripRecorder = recorder
        self.locationProvider = location
        self.tripRepository = repo
        self.fuelStatistics = fuelStats
        self.fuelRepository = fuelRepo
        self.fuelCalibrator = FuelCalibrator(
            fuelRepository: fuelRepo,
            tripRepository: repo,
            settings: settings
        )
        self.speedCalibrator = SpeedCalibrator(settings: settings)
        self.audioAnnouncer = announcer
        self.alertEngine = alerts
        self.maintenanceService = maint
        self.liveActivity = LiveActivityController()
        self.cloudSync = CloudSyncController(settings: settings)
        self.watchBridge = watch
        self.eventDetector = EventDetector(useMotion: settings.useMotionSensors)
        self.care = care
        self.dtcMonitor = dtcMonitor
        care.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        alerts.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        dtcMonitor.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    func start() {
        guard !started else { return }
        started = true
        maintenanceService.ensureDefaults()
        cloudSync.startIfNeeded()
        watchBridge.bind(obd: obd, tripRecorder: tripRecorder)
        alertEngine.startListening(to: obd.snapshots)
        dtcMonitor.start()
        care.startListening(to: obd.snapshots) { [weak self] in
            self?.obd.supportedPIDs ?? []
        }
        tripRecorder.onTripEnded = { [weak self] trip in
            self?.care.onTripEnded(trip)
        }
        tripRecorder.startListening(to: obd.snapshots) { [weak self] in
            self?.obd.connection ?? .idle
        }
        locationProvider.requestPermission()
        widgetTask = Task { [weak self] in
            guard let self else { return }
            for await snap in self.obd.snapshots {
                self.watchBridge.pushIfNeeded()
                self.publishWidget(snapshot: snap)
                if let loc = self.locationProvider.lastLocation {
                    self.speedCalibrator.ingest(obdSpeedKmh: snap.speedKmh ?? 0, location: loc)
                }
                _ = self.eventDetector.evaluate(snapshot: snap)
            }
        }
        Task {
            await obd.start()
        }
    }

    private func publishWidget(snapshot: VehicleSnapshot) {
        let last = tripRepository.recentTrips(limit: 1).first
        let avg = last?.avgL100 ?? 0
        let pct = snapshot.fuelLevelPct
        let liters = (pct ?? 0) / 100 * settings.tankCapacityL
        let range = avg > 0.5 ? liters / avg * 100 : nil
        WidgetDataStore.save(
            WidgetSnapshot(
                fuelLevelPct: pct,
                estimatedRangeKm: range,
                lastTripDistanceKm: last?.distanceKm,
                lastTripDurationS: last?.durationS,
                lastTripL100: last?.avgL100,
                lastTripScore: last?.scoreTotal,
                updatedAt: Date()
            )
        )
    }
}
