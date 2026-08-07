import Foundation
import SwiftData

enum Migrations {
    private static let seededKey = "migrations.maintenanceSeeded"

    static func runIfNeeded(context: ModelContext) {
        seedMaintenanceIfNeeded(context: context)
        ensureActiveVehicleProfile(context: context)
    }

    private static func seedMaintenanceIfNeeded(context: ModelContext) {
        guard !UserDefaults.standard.bool(forKey: seededKey) else { return }
        for item in MaintenanceTemplates.defaults() {
            context.insert(item)
        }
        try? context.save()
        UserDefaults.standard.set(true, forKey: seededKey)
    }

    private static func ensureActiveVehicleProfile(context: ModelContext) {
        let descriptor = FetchDescriptor<VehicleProfile>(
            predicate: #Predicate { $0.isActive == true }
        )
        let existing = (try? context.fetch(descriptor)) ?? []
        if existing.isEmpty {
            context.insert(VehicleProfile())
            try? context.save()
        }
    }
}
