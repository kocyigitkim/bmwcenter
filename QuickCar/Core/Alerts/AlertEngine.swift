import Foundation
import Combine
import UserNotifications

@MainActor
final class AlertEngine: ObservableObject {
    @Published private(set) var activeAlerts: [ActiveAlert] = []

    private let settings: AppSettings
    private let announcer: AudioAnnouncer
    private var lastFired: [String: Date] = [:]
    private var wasActive: Set<String> = []
    private var listenTask: Task<Void, Never>?
    private var newDTCFlag = false

    init(settings: AppSettings, announcer: AudioAnnouncer) {
        self.settings = settings
        self.announcer = announcer
    }

    func flagNewDTC() {
        newDTCFlag = true
    }

    /// Called by DTCMonitor when brand-new codes appear (including pending at high load).
    func notifyNewDTCs(_ codes: [DTC]) {
        guard !codes.isEmpty, settings.enableAlerts else { return }
        newDTCFlag = true
        let body = codes.map { dtc in
            if let summary = dtc.summary, !summary.isEmpty {
                return "\(dtc.code): \(summary)"
            }
            return dtc.code
        }.joined(separator: "\n")
        let title = String(localized: "alert.newDTC.title", table: "Localizable")
        announcer.announce(title + ". " + body.replacingOccurrences(of: "\n", with: ". "), severity: .critical)
        postLocalNotification(title: title, body: body)
        let chip = ActiveAlert(id: "dtc.new", title: title, severity: .critical)
        if !activeAlerts.contains(where: { $0.id == "dtc.new" }) {
            activeAlerts.append(chip)
        }
        lastFired["dtc.new"] = Date()
        wasActive.insert("dtc.new")
        newDTCFlag = false
    }

    func startListening(to snapshots: AsyncStream<VehicleSnapshot>) {
        listenTask?.cancel()
        listenTask = Task { [weak self] in
            var lastEval = Date.distantPast
            for await snap in snapshots {
                guard let self else { break }
                let now = Date()
                guard now.timeIntervalSince(lastEval) >= 1.0 else { continue }
                lastEval = now
                await MainActor.run {
                    self.evaluate(snapshot: snap, now: now)
                }
            }
        }
    }

    func stop() {
        listenTask?.cancel()
        listenTask = nil
    }

    func evaluate(snapshot: VehicleSnapshot, now: Date = .now) {
        guard settings.enableAlerts else {
            activeAlerts = []
            return
        }

        let profile = VehicleProfileSnapshot(tankCapacityL: settings.tankCapacityL)
        var next: [ActiveAlert] = []

        for rule in AlertRules.builtIn {
            // Care OverheatWatchdog owns coolant high/critical announcements
            if settings.careOverheatWatchdog,
               rule.id == "coolant.high" || rule.id == "coolant.critical" {
                continue
            }
            var triggered = rule.evaluate(snapshot, profile)
            // Hysteresis: when dropping, loosen by ~5%
            if !triggered, wasActive.contains(rule.id) {
                triggered = hysteresisStillActive(ruleID: rule.id, snapshot: snapshot)
            }
            if rule.id == "dtc.new", newDTCFlag {
                triggered = true
            }
            guard triggered else { continue }

            if let last = lastFired[rule.id], now.timeIntervalSince(last) < rule.cooldownS {
                if wasActive.contains(rule.id) {
                    next.append(ActiveAlert(
                        id: rule.id,
                        title: String(localized: String.LocalizationValue(rule.titleKey), table: "Localizable"),
                        severity: rule.severity
                    ))
                }
                continue
            }

            let title = String(localized: String.LocalizationValue(rule.titleKey), table: "Localizable")
            let body = String(localized: String.LocalizationValue(rule.bodyKey), table: "Localizable")
            let alert = ActiveAlert(id: rule.id, title: title, severity: rule.severity)
            next.append(alert)
            lastFired[rule.id] = now
            wasActive.insert(rule.id)

            announcer.announce(title + ". " + body, severity: rule.severity)
            if rule.severity == .critical {
                postLocalNotification(title: title, body: body)
            }
            if rule.id == "dtc.new" {
                newDTCFlag = false
            }
        }

        // Clear wasActive for rules no longer firing
        let nextIDs = Set(next.map(\.id))
        wasActive = wasActive.intersection(nextIDs).union(nextIDs)
        activeAlerts = next
    }

    private func hysteresisStillActive(ruleID: String, snapshot: VehicleSnapshot) -> Bool {
        switch ruleID {
        case "coolant.high": return (snapshot.coolantC ?? 0) > 105 * 0.95
        case "coolant.critical": return (snapshot.coolantC ?? 0) > 115 * 0.95
        case "oil.high": return (snapshot.oilTempC ?? 0) > 125 * 0.95
        case "fuel.low": return (snapshot.fuelLevelPct ?? 100) < 12 * 1.05
        case "fuel.critical": return (snapshot.fuelLevelPct ?? 100) < 6 * 1.05
        case "voltage.low": return snapshot.isEngineRunning && (snapshot.voltage ?? 14) < 12.0 * 1.05
        case "voltage.charging": return (snapshot.rpm ?? 0) > 900 && (snapshot.voltage ?? 14) < 13.2 * 1.05
        case "boost.high": return (snapshot.boostKpa ?? 0) > 130 * 0.95
        case "catalyst.high": return (snapshot.catalystC ?? 0) > 900 * 0.95
        case "trim.high": return abs(snapshot.ltftBank1 ?? 0) > 15 * 0.95
        default: return false
        }
    }

    private func postLocalNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let req = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(req)
    }
}
