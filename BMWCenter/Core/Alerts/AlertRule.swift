import Foundation

struct AlertRule: Identifiable {
    let id: String
    let titleKey: String
    let bodyKey: String
    let severity: AlertSeverity
    let cooldownS: TimeInterval
    let evaluate: (VehicleSnapshot, VehicleProfileSnapshot) -> Bool
}

struct VehicleProfileSnapshot: Sendable {
    var tankCapacityL: Double = 60
}

enum AlertRules {
    static let builtIn: [AlertRule] = [
        AlertRule(id: "coolant.high", titleKey: "alert.coolantHigh.title", bodyKey: "alert.coolantHigh.body", severity: .warning, cooldownS: 300) { snap, _ in
            (snap.coolantC ?? 0) > 105
        },
        AlertRule(id: "coolant.critical", titleKey: "alert.coolantCritical.title", bodyKey: "alert.coolantCritical.body", severity: .critical, cooldownS: 120) { snap, _ in
            (snap.coolantC ?? 0) > 115
        },
        AlertRule(id: "oil.high", titleKey: "alert.oilHigh.title", bodyKey: "alert.oilHigh.title", severity: .warning, cooldownS: 300) { snap, _ in
            (snap.oilTempC ?? 0) > 125
        },
        AlertRule(id: "fuel.low", titleKey: "alert.fuelLow.title", bodyKey: "alert.fuelLow.title", severity: .warning, cooldownS: 900) { snap, _ in
            (snap.fuelLevelPct ?? 100) < 12
        },
        AlertRule(id: "fuel.critical", titleKey: "alert.fuelCritical.title", bodyKey: "alert.fuelCritical.title", severity: .critical, cooldownS: 600) { snap, _ in
            (snap.fuelLevelPct ?? 100) < 6
        },
        AlertRule(id: "voltage.low", titleKey: "alert.voltageLow.title", bodyKey: "alert.voltageLow.title", severity: .warning, cooldownS: 600) { snap, _ in
            snap.isEngineRunning && (snap.voltage ?? 14) < 12.0
        },
        AlertRule(id: "voltage.charging", titleKey: "alert.chargingLow.title", bodyKey: "alert.chargingLow.title", severity: .warning, cooldownS: 900) { snap, _ in
            (snap.rpm ?? 0) > 900 && (snap.voltage ?? 14) < 13.2
        },
        AlertRule(id: "rpm.coldHigh", titleKey: "alert.coldRev.title", bodyKey: "alert.coldRev.body", severity: .info, cooldownS: 180) { snap, _ in
            (snap.rpm ?? 0) > 3000 && (snap.coolantC ?? 99) < 60
        },
        AlertRule(id: "boost.high", titleKey: "metric.boost", bodyKey: "metric.boost", severity: .info, cooldownS: 600) { snap, _ in
            (snap.boostKpa ?? 0) > 130
        },
        AlertRule(id: "trim.high", titleKey: "alert.trimHigh.title", bodyKey: "alert.trimHigh.title", severity: .info, cooldownS: 3600) { snap, _ in
            abs(snap.ltftBank1 ?? 0) > 15
        },
        AlertRule(id: "catalyst.high", titleKey: "alert.catalystHigh.title", bodyKey: "alert.catalystHigh.title", severity: .warning, cooldownS: 600) { snap, _ in
            (snap.catalystC ?? 0) > 900
        },
        AlertRule(id: "dtc.new", titleKey: "alert.newDTC.title", bodyKey: "alert.newDTC.title", severity: .critical, cooldownS: 3600) { _, _ in
            false // triggered via AlertEngine.flagNewDTC()
        }
    ]
}
