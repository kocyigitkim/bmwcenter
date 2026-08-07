import Foundation
import Combine

@MainActor
final class DashboardViewModel: ObservableObject {
    private let obd: OBDService
    private let tripRecorder: TripRecorder
    private let settings: AppSettings

    init(obd: OBDService, tripRecorder: TripRecorder, settings: AppSettings) {
        self.obd = obd
        self.tripRecorder = tripRecorder
        self.settings = settings
    }

    var snapshot: VehicleSnapshot { obd.snapshot }
    var connection: OBDConnectionState { obd.connection }
    var instantText: String {
        Formatters.consumption(
            l100km: obd.instantL100,
            idleLh: obd.idleLh,
            speedKmh: snapshot.speedKmh,
            settings: settings
        )
    }
    var liveTrip: LiveTripMetrics { tripRecorder.live }
    var isRecording: Bool { tripRecorder.state.isActive }
    var recentSpeeds: [Double] { obd.recentSpeeds }
    var recentConsumption: [Double] { obd.recentConsumption }

    func stopTrip() {
        tripRecorder.manualStop()
    }
}
