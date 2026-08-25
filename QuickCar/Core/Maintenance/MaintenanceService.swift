import Foundation
import SwiftData
import UserNotifications

enum MaintenanceStatus: String, Sendable {
    case ok, soon, overdue
}

struct MaintenanceStatusItem: Identifiable, Sendable {
    var id: UUID
    var titleKey: String
    var customTitle: String?
    var remainingKm: Double?
    var remainingDays: Int?
    var status: MaintenanceStatus
}

@MainActor
final class MaintenanceService {
    private let modelContext: ModelContext
    private let settings: AppSettings
    private var lastNotifiedStatus: [UUID: MaintenanceStatus] = [:]
    private var lastOverdueNotify: [UUID: Date] = [:]

    init(modelContext: ModelContext, settings: AppSettings) {
        self.modelContext = modelContext
        self.settings = settings
    }

    func ensureDefaults() {
        let descriptor = FetchDescriptor<MaintenanceItem>()
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        guard existing.isEmpty else { return }
        for item in MaintenanceTemplates.defaults() {
            modelContext.insert(item)
        }
        try? modelContext.save()
    }

    func currentOdometerKm(tripDistanceTotal: Double) -> Double {
        // VehicleProfile may not be loaded; use settings vehicle odometer via trips.
        // Prefer active VehicleProfile if present.
        let profiles = (try? modelContext.fetch(FetchDescriptor<VehicleProfile>())) ?? []
        if let active = profiles.first(where: \.isActive) {
            return active.odometerKm + active.odometerOffsetKm + tripDistanceTotal
        }
        return tripDistanceTotal
    }

    func statuses(odometerKm: Double, now: Date = .now) -> [MaintenanceStatusItem] {
        let items = (try? modelContext.fetch(FetchDescriptor<MaintenanceItem>())) ?? []
        return items.filter(\.isEnabled).map { item in
            evaluate(item, odometerKm: odometerKm, now: now)
        }
    }

    func evaluate(_ item: MaintenanceItem, odometerKm: Double, now: Date = .now) -> MaintenanceStatusItem {
        var remainingKm: Double?
        var remainingDays: Int?

        if let intervalKm = item.intervalKm {
            let base = item.lastDoneKm ?? (odometerKm - intervalKm)
            remainingKm = intervalKm - (odometerKm - base)
        }
        if let months = item.intervalMonths {
            let baseDate = item.lastDoneDate ?? Calendar.current.date(byAdding: .month, value: -months, to: now) ?? now
            if let due = Calendar.current.date(byAdding: .month, value: months, to: baseDate) {
                remainingDays = Calendar.current.dateComponents([.day], from: now, to: due).day
            }
        }

        let status = classify(remainingKm: remainingKm, remainingDays: remainingDays, item: item)
        return MaintenanceStatusItem(
            id: item.id,
            titleKey: item.titleKey,
            customTitle: item.customTitle,
            remainingKm: remainingKm,
            remainingDays: remainingDays,
            status: status
        )
    }

    private func classify(remainingKm: Double?, remainingDays: Int?, item: MaintenanceItem) -> MaintenanceStatus {
        var fractions: [Double] = []
        if let remainingKm, let interval = item.intervalKm, interval > 0 {
            fractions.append(remainingKm / interval)
        }
        if let remainingDays, let months = item.intervalMonths {
            let totalDays = Double(months) * 30.0
            if totalDays > 0 {
                fractions.append(Double(remainingDays) / totalDays)
            }
        }
        guard let frac = fractions.min() else { return .ok }
        if frac < 0 { return .overdue }
        if frac <= 0.25 { return .soon }
        return .ok
    }

    func markDone(_ item: MaintenanceItem, odometerKm: Double, cost: Double?, note: String?, now: Date = .now) {
        item.lastDoneKm = odometerKm
        item.lastDoneDate = now
        item.lastCost = cost
        if let note { item.note = note }
        try? modelContext.save()
        lastNotifiedStatus[item.id] = .ok
    }

    func checkNotifications(odometerKm: Double, now: Date = .now) {
        for status in statuses(odometerKm: odometerKm, now: now) {
            let prev = lastNotifiedStatus[status.id]
            if status.status == .soon, prev != .soon {
                notify(status)
                lastNotifiedStatus[status.id] = .soon
            }
            if status.status == .overdue {
                let last = lastOverdueNotify[status.id] ?? .distantPast
                if now.timeIntervalSince(last) >= 7 * 86400 {
                    notify(status)
                    lastOverdueNotify[status.id] = now
                    lastNotifiedStatus[status.id] = .overdue
                }
            }
        }
    }

    private func notify(_ item: MaintenanceStatusItem) {
        let title = item.customTitle
            ?? String(localized: String.LocalizationValue(item.titleKey), table: "Localizable")
        let content = UNMutableNotificationContent()
        content.title = String(localized: "maintenance.title", table: "Localizable")
        if item.status == .overdue {
            content.body = "\(title) — \(String(localized: "maintenance.overdue", table: "Localizable"))"
        } else {
            content.body = "\(title) — \(String(localized: "maintenance.dueIn", table: "Localizable"))"
        }
        content.sound = .default
        let req = UNNotificationRequest(identifier: "maint-\(item.id)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }

    func totalMaintenanceCost() -> Double {
        let items = (try? modelContext.fetch(FetchDescriptor<MaintenanceItem>())) ?? []
        return items.compactMap(\.lastCost).reduce(0, +)
    }
}
