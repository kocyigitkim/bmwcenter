import Foundation

struct CrankEvent: Sendable, Equatable {
    var date: Date
    var minVoltage: Double
    var restingVoltage: Double
    var recoveryVoltage: Double
    var ambientC: Double?
}

enum BatteryStatus: String, Sendable {
    case good, fair, weak
}

struct BatteryAssessment: Sendable, Equatable {
    var status: BatteryStatus
    var chargingSystemLow: Bool
    var declining: Bool
    var slopePerCrank: Double?
}

enum BatteryHealthAnalyzer {
    /// Capture crank when RPM crosses 0 → >300. Samples are (time, voltage) around the transition.
    static func detectCrank(
        previousRPM: Double?,
        currentRPM: Double?,
        voltageSamples: [(Date, Double)],
        ambientC: Double?,
        now: Date = .now
    ) -> CrankEvent? {
        let prev = previousRPM ?? 0
        let curr = currentRPM ?? 0
        guard prev <= 300, curr > 300 else { return nil }
        guard !voltageSamples.isEmpty else { return nil }

        let windowStart = now.addingTimeInterval(-2)
        let windowEnd = now.addingTimeInterval(2)
        let inWindow = voltageSamples.filter { $0.0 >= windowStart && $0.0 <= windowEnd }
        guard !inWindow.isEmpty else { return nil }

        let resting = voltageSamples
            .filter { $0.0 < now }
            .suffix(5)
            .map(\.1)
        let restingVoltage = resting.isEmpty
            ? (inWindow.map(\.1).max() ?? 12.4)
            : resting.reduce(0, +) / Double(resting.count)

        let minVoltage = inWindow.map(\.1).min() ?? restingVoltage
        let recovery = voltageSamples
            .filter { $0.0 >= now }
            .prefix(10)
            .map(\.1)
        let recoveryVoltage = recovery.isEmpty
            ? (inWindow.map(\.1).last ?? restingVoltage)
            : recovery.reduce(0, +) / Double(recovery.count)

        return CrankEvent(
            date: now,
            minVoltage: minVoltage,
            restingVoltage: restingVoltage,
            recoveryVoltage: recoveryVoltage,
            ambientC: ambientC
        )
    }

    static func classify(minVoltage: Double, ambientC: Double?) -> BatteryStatus {
        var v = minVoltage
        // Cold correction: one tier more lenient below 5 °C
        if let ambientC, ambientC < 5 {
            v += 0.5
        }
        switch v {
        case 10.5...: return .good
        case 9.6..<10.5: return .fair
        default: return .weak
        }
    }

    static func assess(history: [CrankEvent]) -> BatteryAssessment? {
        guard let latest = history.last else { return nil }
        let status = classify(minVoltage: latest.minVoltage, ambientC: latest.ambientC)
        let chargingLow = latest.recoveryVoltage < 13.2
        let slope = linearSlope(history.suffix(20).map(\.minVoltage))
        let declining = (slope ?? 0) < -0.02
        return BatteryAssessment(
            status: status,
            chargingSystemLow: chargingLow,
            declining: declining,
            slopePerCrank: slope
        )
    }

    /// Ordinary least-squares slope of y over index x = 0...n-1.
    static func linearSlope(_ values: [Double]) -> Double? {
        let n = Double(values.count)
        guard n >= 2 else { return nil }
        let xs = (0..<values.count).map(Double.init)
        let meanX = xs.reduce(0, +) / n
        let meanY = values.reduce(0, +) / n
        var num = 0.0
        var den = 0.0
        for i in values.indices {
            let dx = xs[i] - meanX
            num += dx * (values[i] - meanY)
            den += dx * dx
        }
        guard den > 0 else { return nil }
        return num / den
    }
}
