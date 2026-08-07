import CarPlay
import Foundation
import Combine

@MainActor
final class CarPlayCoordinator: NSObject {
    private let interfaceController: CPInterfaceController
    private let env: AppEnvironment
    private var alertPresenter: AlertPresenter
    private let throttle = Throttle(interval: 1.0)

    private var tabBar: CPTabBarTemplate?
    private var liveTemplate: CPListTemplate?
    private var tripTemplate: CPListTemplate?
    private var fuelTemplate: CPListTemplate?
    private var historyTemplate: CPListTemplate?

    private var snapshotTask: Task<Void, Never>?
    private var connectionCancellable: AnyCancellable?
    private var tripCancellable: AnyCancellable?
    private var lastLiveSignature: String = ""
    private var lastTripSignature: String = ""
    private var disconnectSince: Date?
    private var selectedIndex: Int = 0

    init(interfaceController: CPInterfaceController, env: AppEnvironment) {
        self.interfaceController = interfaceController
        self.env = env
        self.alertPresenter = AlertPresenter(interfaceController: interfaceController)
        super.init()
    }

    func start() {
        env.start()
        buildRoot()
        observe()
    }

    func stop() {
        snapshotTask?.cancel()
        snapshotTask = nil
        connectionCancellable?.cancel()
        tripCancellable?.cancel()
        Task { await throttle.cancel() }
    }

    private func buildRoot() {
        let live = LiveTemplateBuilder.make(
            snapshot: env.obd.snapshot,
            connection: env.obd.connection,
            instantText: instantText(),
            rangeKm: rangeKm(),
            isRecording: env.tripRecorder.state.isActive,
            settings: env.settings,
            onStartStop: { [weak self] in self?.env.tripRecorder.toggle() },
            onRefresh: { [weak self] in Task { await self?.env.obd.refreshNow() } },
            onReconnect: { [weak self] in Task { await self?.env.obd.reconnect() } }
        )
        let trip = TripTemplateBuilder.make(
            live: env.tripRecorder.live,
            isActive: env.tripRecorder.state.isActive,
            settings: env.settings,
            onStartStop: { [weak self] in self?.env.tripRecorder.toggle() }
        )
        let fuel = FuelTemplateBuilder.make(
            today: todaySummary(),
            week: weekSummary(),
            fuelLevel: env.obd.snapshot.fuelLevelPct,
            rangeKm: rangeKm(),
            lastRefuelText: lastRefuelText(),
            settings: env.settings,
            onSelectDetail: { [weak self] in self?.pushFuelDetail() }
        )
        let history = HistoryTemplateBuilder.make(
            trips: env.tripRepository.recentTrips(limit: 30),
            settings: env.settings,
            onSelect: { [weak self] trip in self?.pushHistoryDetail(trip) }
        )

        liveTemplate = live
        tripTemplate = trip
        fuelTemplate = fuel
        historyTemplate = history

        let tabBar = CPTabBarTemplate(templates: [live, trip, fuel, history])
        tabBar.delegate = self
        self.tabBar = tabBar
        interfaceController.setRootTemplate(tabBar, animated: true, completion: nil)
    }

    private func observe() {
        snapshotTask = Task { [weak self] in
            guard let self else { return }
            for await _ in self.env.obd.snapshots {
                await self.throttle.fire { [weak self] in
                    await MainActor.run { self?.refreshVisible() }
                }
            }
        }

        connectionCancellable = env.obd.$connection
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.handleConnection(state)
            }

        tripCancellable = env.tripRecorder.$live
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { [weak self] in
                    await self?.throttle.fire { [weak self] in
                        await MainActor.run { self?.refreshVisible() }
                    }
                }
            }
    }

    private func handleConnection(_ state: OBDConnectionState) {
        switch state {
        case .failed(.bluetoothOff):
            alertPresenter.presentBluetoothOff()
            disconnectSince = Date()
        case .failed(.disconnected), .idle:
            if disconnectSince == nil { disconnectSince = Date() }
            if let since = disconnectSince, Date().timeIntervalSince(since) > 10 {
                alertPresenter.presentDisconnected()
            }
        case .connected:
            disconnectSince = nil
            alertPresenter.reset()
        default:
            break
        }
        refreshVisible()
    }

    private func refreshVisible() {
        guard let tabBar else { return }
        let selected = tabBar.selectedTemplate
        if selected === liveTemplate || selectedIndex == 0 {
            refreshLive()
        } else if selected === tripTemplate || selectedIndex == 1 {
            refreshTrip()
        } else if selected === fuelTemplate || selectedIndex == 2 {
            refreshFuel()
        } else if selected === historyTemplate || selectedIndex == 3 {
            refreshHistory()
        }
    }

    private func refreshLive() {
        let signature = liveSignature()
        guard signature != lastLiveSignature else { return }
        lastLiveSignature = signature
        liveTemplate?.updateSections(
            LiveTemplateBuilder.sections(
                snapshot: env.obd.snapshot,
                connection: env.obd.connection,
                instantText: instantText(),
                rangeKm: rangeKm(),
                isRecording: env.tripRecorder.state.isActive,
                settings: env.settings,
                onStartStop: { [weak self] in self?.env.tripRecorder.toggle() },
                onRefresh: { [weak self] in Task { await self?.env.obd.refreshNow() } },
                onReconnect: { [weak self] in Task { await self?.env.obd.reconnect() } }
            )
        )
    }

    private func refreshTrip() {
        let signature = "\(env.tripRecorder.state)-\(Int(env.tripRecorder.live.durationS))-\(Int(env.tripRecorder.live.distanceKm * 10))"
        guard signature != lastTripSignature else { return }
        lastTripSignature = signature
        tripTemplate?.updateSections(
            TripTemplateBuilder.sections(
                live: env.tripRecorder.live,
                isActive: env.tripRecorder.state.isActive,
                settings: env.settings,
                onStartStop: { [weak self] in self?.env.tripRecorder.toggle() }
            )
        )
    }

    private func refreshFuel() {
        fuelTemplate?.updateSections(
            FuelTemplateBuilder.sections(
                today: todaySummary(),
                week: weekSummary(),
                fuelLevel: env.obd.snapshot.fuelLevelPct,
                rangeKm: rangeKm(),
                lastRefuelText: lastRefuelText(),
                settings: env.settings,
                onSelectDetail: { [weak self] in self?.pushFuelDetail() }
            )
        )
    }

    private func refreshHistory() {
        // Rebuild only when trips count changes — keep simple
        let trips = env.tripRepository.recentTrips(limit: 30)
        let newTemplate = HistoryTemplateBuilder.make(
            trips: trips,
            settings: env.settings,
            onSelect: { [weak self] trip in self?.pushHistoryDetail(trip) }
        )
        // Cannot easily replace tab template; update by recreating root rarely.
        // For MVP, push detail handles interaction; list stays until reconnect.
        _ = newTemplate
    }

    private func pushFuelDetail() {
        guard stackDepth() < 5 else { return }
        let daily = env.fuelStatistics.dailyFuel()
        let detail = FuelTemplateBuilder.detailTemplate(daily: daily, settings: env.settings)
        interfaceController.pushTemplate(detail, animated: true, completion: nil)
    }

    private func pushHistoryDetail(_ trip: Trip) {
        guard stackDepth() < 5 else { return }
        let detail = HistoryTemplateBuilder.detail(for: trip, settings: env.settings)
        interfaceController.pushTemplate(detail, animated: true, completion: nil)
    }

    private func stackDepth() -> Int {
        interfaceController.templates.count
    }

    private func instantText() -> String {
        Formatters.consumption(
            l100km: env.obd.instantL100,
            idleLh: env.obd.idleLh,
            speedKmh: env.obd.snapshot.speedKmh,
            settings: env.settings
        )
    }

    private func rangeKm() -> Double? {
        let week = weekSummary()
        return FuelCalculator.estimatedRangeKm(
            fuelLevelPct: env.obd.snapshot.fuelLevelPct,
            tankCapacityL: env.settings.tankCapacityL,
            avgL100: week.avgL100 == 0 ? nil : week.avgL100
        )
    }

    private func todaySummary() -> DrivingSummary {
        let start = Calendar.current.startOfDay(for: Date())
        return env.tripRepository.summary(for: DateInterval(start: start, end: start.addingTimeInterval(86400)))
    }

    private func weekSummary() -> DrivingSummary {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -7, to: end) ?? end
        return env.tripRepository.summary(for: DateInterval(start: start, end: end))
    }

    private func lastRefuelText() -> String {
        guard let entry = env.fuelStatistics.lastRefuel() else {
            return Formatters.unavailable
        }
        return "\(entry.date.formatted(date: .abbreviated, time: .omitted)) · \(Formatters.liters(entry.liters))"
    }

    private func liveSignature() -> String {
        let s = env.obd.snapshot
        return "\(Int(s.speedKmh ?? -1))-\(Int(s.rpm ?? -1))-\(Int(s.coolantC ?? -1))-\(Int(s.fuelLevelPct ?? -1))-\(env.tripRecorder.state.isActive)-\(String(describing: env.obd.connection))"
    }
}

extension CarPlayCoordinator: CPTabBarTemplateDelegate {
    nonisolated func tabBarTemplate(_ tabBarTemplate: CPTabBarTemplate, didSelect selectedTemplate: CPTemplate) {
        Task { @MainActor in
            if let templates = self.tabBar?.templates,
               let idx = templates.firstIndex(where: { $0 === selectedTemplate }) {
                self.selectedIndex = idx
            }
            self.refreshVisible()
        }
    }
}
