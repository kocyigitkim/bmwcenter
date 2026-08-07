import Foundation

struct FuelSample: Sendable, Equatable {
    var t: Date
    var speedKmh: Double
    var fuelRateLh: Double?
}

struct FuelIntegrationState: Sendable, Equatable {
    var fuelUsedL: Double = 0
    var distanceKm: Double = 0
    var idleFuelL: Double = 0
    var prev: FuelSample?

    mutating func integrate(_ sample: FuelSample) {
        guard let prev else {
            self.prev = sample
            return
        }
        let dt = sample.t.timeIntervalSince(prev.t)
        guard dt > 0, dt < 10 else {
            self.prev = sample
            return
        }
        if let rate = sample.fuelRateLh, let prevRate = prev.fuelRateLh {
            let dFuel = (rate + prevRate) / 2 * dt / 3600
            fuelUsedL += dFuel
            if sample.speedKmh < 3 {
                idleFuelL += dFuel
            }
        }
        let dDist = (sample.speedKmh + prev.speedKmh) / 2 * dt / 3600
        distanceKm += dDist
        self.prev = sample
    }

    var avgL100: Double? {
        guard distanceKm > 0.1, fuelUsedL > 0 else { return nil }
        let v = fuelUsedL / distanceKm * 100
        guard v >= 0.5, v <= 60 else { return nil }
        return v
    }

    var kmPerL: Double? {
        guard fuelUsedL > 0 else { return nil }
        return distanceKm / fuelUsedL
    }

    var mpgUS: Double? {
        guard let avgL100 else { return nil }
        return 235.215 / avgL100
    }

    var mpgUK: Double? {
        guard let avgL100 else { return nil }
        return 282.481 / avgL100
    }
}

enum FuelCalculator {
    static func fuelRateLh(
        snapshot: VehicleSnapshot,
        fuelType: FuelType,
        displacementL: Double,
        volumetricEfficiency: Double,
        calibrationFactor: Double = 1.0
    ) -> Double? {
        var rate: Double?
        if let engineRate = snapshot.engineFuelRateLh {
            rate = engineRate
        } else if let maf = snapshot.mafGs {
            rate = maf * fuelType.mafToLh
        } else if let map = snapshot.mapKpa, let iat = snapshot.intakeAirC, let rpm = snapshot.rpm, rpm > 0 {
            let imap = rpm * map / (iat + 273.15)
            let maf = (imap / 120.0) * volumetricEfficiency * displacementL * 28.97 / 8.314
            rate = maf * fuelType.mafToLh
        }
        guard var rate else { return nil }
        rate *= calibrationFactor
        return rate
    }

    static func instantL100(fuelRateLh: Double?, speedKmh: Double?) -> (l100: Double?, idleLh: Double?) {
        guard let fuelRateLh else { return (nil, nil) }
        if let speedKmh, speedKmh > 3 {
            return (fuelRateLh / speedKmh * 100, nil)
        }
        return (nil, fuelRateLh)
    }

    static func estimatedRangeKm(fuelLevelPct: Double?, tankCapacityL: Double, avgL100: Double?) -> Double? {
        guard let fuelLevelPct, let avgL100, avgL100 > 0 else { return nil }
        return fuelLevelPct / 100 * tankCapacityL / avgL100 * 100
    }

    static func cost(fuelUsedL: Double, pricePerLiter: Double) -> Double {
        fuelUsedL * pricePerLiter
    }

    static func isValidAvgL100(_ value: Double?) -> Bool {
        guard let value else { return false }
        return value >= 0.5 && value <= 60
    }
}
