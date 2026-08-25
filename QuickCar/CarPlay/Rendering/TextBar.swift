import Foundation

enum TextBar {
    /// Block bar using █ / ▌ / ░ — always width characters, value shown separately by caller.
    static func make(_ progress: Double, width: Int = 8) -> String {
        let clamped = min(max(progress, 0), 1)
        let units = clamped * Double(width)
        let full = Int(units)
        let frac = units - Double(full)
        let half = frac >= 0.5 ? 1 : 0
        let empty = max(0, width - full - half)
        return String(repeating: "█", count: full)
            + String(repeating: "▌", count: half)
            + String(repeating: "░", count: empty)
    }
}
