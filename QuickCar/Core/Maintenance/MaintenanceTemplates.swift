import Foundation

enum MaintenanceTemplates {
    static func defaults() -> [MaintenanceItem] {
        [
            MaintenanceItem(titleKey: "maintenance.oil", intervalKm: 10_000, intervalMonths: 12),
            MaintenanceItem(titleKey: "maintenance.airFilter", intervalKm: 30_000, intervalMonths: 24),
            MaintenanceItem(titleKey: "maintenance.cabinFilter", intervalKm: 20_000, intervalMonths: 12),
            MaintenanceItem(titleKey: "maintenance.sparkPlugs", intervalKm: 60_000, intervalMonths: 48),
            MaintenanceItem(titleKey: "maintenance.brakeFluid", intervalMonths: 24),
            MaintenanceItem(titleKey: "maintenance.coolant", intervalKm: 60_000, intervalMonths: 48),
            MaintenanceItem(titleKey: "maintenance.brakePads", intervalKm: 40_000),
            MaintenanceItem(titleKey: "maintenance.tireRotation", intervalKm: 10_000),
            MaintenanceItem(titleKey: "maintenance.inspection", intervalMonths: 24),
            MaintenanceItem(titleKey: "maintenance.insurance", intervalMonths: 12)
        ]
    }
}
