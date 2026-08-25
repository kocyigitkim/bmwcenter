import Foundation

struct EMA: Sendable {
    var value: Double?
    let alpha: Double

    init(alpha: Double) {
        self.alpha = alpha
    }

    mutating func update(_ sample: Double) -> Double {
        if let value {
            let next = value * (1 - alpha) + sample * alpha
            self.value = next
            return next
        }
        value = sample
        return sample
    }

    mutating func reset() {
        value = nil
    }
}
