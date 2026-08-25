import Foundation
import Combine

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var isEditing = false
    @Published private(set) var layout: DashboardLayout

    private let obd: OBDService
    private let tripRecorder: TripRecorder
    let settings: AppSettings
    private let store: DashboardLayoutStore

    init(
        obd: OBDService,
        tripRecorder: TripRecorder,
        settings: AppSettings,
        store: DashboardLayoutStore = DashboardLayoutStore()
    ) {
        self.obd = obd
        self.tripRecorder = tripRecorder
        self.settings = settings
        self.store = store
        self.layout = store.load(from: settings)
    }

    var snapshot: VehicleSnapshot { obd.snapshot }
    var connection: OBDConnectionState { obd.connection }
    var liveTrip: LiveTripMetrics { tripRecorder.live }
    var isRecording: Bool { tripRecorder.state.isActive }
    var recentConsumption: [Double] { obd.recentConsumption }
    var instantL100: Double? { obd.instantL100 }
    var idleLh: Double? { obd.idleLh }

    var placedKinds: Set<DashboardWidgetKind> { layout.placedKinds }

    var galleryKinds: [DashboardWidgetKind] {
        DashboardWidgetKind.allCases.filter { !placedKinds.contains($0) }
    }

    func persist() {
        store.save(layout, to: settings)
    }

    func applyPreset(_ preset: DashboardPreset) {
        layout.applyPreset(preset)
        persist()
    }

    func resetToPreset() {
        layout.applyPreset(layout.preset)
        persist()
    }

    func hide(_ kind: DashboardWidgetKind) {
        layout.hide(kind)
        persist()
    }

    func add(_ kind: DashboardWidgetKind) {
        layout.add(kind)
        persist()
    }

    func setSize(_ size: DashboardWidgetSize, for kind: DashboardWidgetKind) {
        layout.setSize(size, for: kind)
        persist()
    }

    func move(_ kind: DashboardWidgetKind, before destination: DashboardWidgetKind) {
        layout.move(kind, before: destination)
        persist()
    }

    func move(_ kind: DashboardWidgetKind, offset: Int) {
        layout.move(kind, offset: offset)
        persist()
    }

    func stopTrip() {
        tripRecorder.manualStop()
    }

    func canMove(_ kind: DashboardWidgetKind, offset: Int) -> Bool {
        guard let from = layout.items.firstIndex(where: { $0.id == kind }) else { return false }
        return layout.items.indices.contains(from + offset)
    }
}
