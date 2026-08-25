import Foundation
import WatchConnectivity

@MainActor
final class WatchConnectivityBridge: NSObject, ObservableObject, WCSessionDelegate {
    @Published var speedKmh: Double?
    @Published var rpm: Double?
    @Published var fuelLevelPct: Double?
    @Published var instantL100: Double?
    @Published var isRecording = false

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func sendStartTrip() {
        send(["action": "startTrip"])
    }

    func sendStopTrip() {
        send(["action": "stopTrip"])
    }

    private func send(_ message: [String: Any]) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(message, replyHandler: nil)
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in
            self.speedKmh = applicationContext["speedKmh"] as? Double
            self.rpm = applicationContext["rpm"] as? Double
            self.fuelLevelPct = applicationContext["fuelLevelPct"] as? Double
            self.instantL100 = applicationContext["instantL100"] as? Double
            self.isRecording = applicationContext["isRecording"] as? Bool ?? false
        }
    }
}
