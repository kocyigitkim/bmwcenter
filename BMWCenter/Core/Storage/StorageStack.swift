import Foundation
import SwiftData

enum StorageStack {
    static func makeContainer() -> ModelContainer {
        let schema = Schema([
            Trip.self,
            TripSample.self,
            DrivingEvent.self,
            RefuelEntry.self,
            FuelPricePoint.self,
            CalibrationSample.self,
            VehicleProfile.self,
            MaintenanceItem.self,
            DTCRecord.self,
            CrankRecord.self,
            AccelRecord.self,
            BaselineMetric.self,
            ProtectionEvent.self,
            ChallengeProgress.self,
            BadgeAward.self,
            StreakState.self,
            MaintenanceLedger.self,
            ThermalEvent.self
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: false)
        do {
            let container = try ModelContainer(for: schema, configurations: [config])
            Migrations.runIfNeeded(context: ModelContext(container))
            return container
        } catch {
            Log.error("ModelContainer failed: \(error). Falling back to in-memory.")
            let memory = ModelConfiguration(isStoredInMemoryOnly: true)
            // swiftlint:disable:next force_try
            return try! ModelContainer(for: schema, configurations: [memory])
        }
    }
}
