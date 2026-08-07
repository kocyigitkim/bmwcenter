import SwiftUI

enum MotionTokens {
    static let gaugeValue = Animation.smooth(duration: 0.45, extraBounce: 0.06)
    static let barFill = Animation.smooth(duration: 0.35)
    static let stateColor = Animation.easeInOut(duration: 0.25)
    static let criticalPulse = Animation.easeInOut(duration: 1.2).repeatForever(autoreverses: true)
    static let glassMorph = Animation.spring(response: 0.42, dampingFraction: 0.82)
    static let scoreFill = Animation.easeOut(duration: 0.9)

    static func gaugeValue(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : gaugeValue
    }

    static func barFill(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : barFill
    }

    static func glassMorph(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : glassMorph
    }

    static func criticalPulse(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : criticalPulse
    }

    static func scoreFill(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : scoreFill
    }
}
