import Foundation
import WatchConnectivity

@MainActor
final class PhoneWatchBridge: NSObject, WCSessionDelegate {
    private let settings: AppSettings
    private weak var tripRecorder: TripRecorder?
    private weak var obd: OBDService?
    private var lastPush = Date.distantPast

    init(settings: AppSettings) {
        self.settings = settings
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func bind(obd: OBDService, tripRecorder: TripRecorder) {
        self.obd = obd
        self.tripRecorder = tripRecorder
    }

    func pushIfNeeded() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let now = Date()
        guard now.timeIntervalSince(lastPush) >= 5 else { return }
        lastPush = now
        var context: [String: Any] = [
            "isRecording": tripRecorder?.state.isActive ?? false
        ]
        if let v = obd?.snapshot.speedKmh { context["speedKmh"] = v }
        if let v = obd?.snapshot.rpm { context["rpm"] = v }
        if let v = obd?.snapshot.fuelLevelPct { context["fuelLevelPct"] = v }
        if let v = obd?.instantL100 { context["instantL100"] = v }
        try? WCSession.default.updateApplicationContext(context)
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            guard let action = message["action"] as? String else { return }
            switch action {
            case "startTrip": tripRecorder?.manualStart()
            case "stopTrip": tripRecorder?.manualStop()
            default: break
            }
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
