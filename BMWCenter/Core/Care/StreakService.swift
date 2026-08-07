import Foundation
import SwiftData

@MainActor
final class StreakService {
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func state() -> StreakState {
        let rows = (try? modelContext.fetch(FetchDescriptor<StreakState>())) ?? []
        if let s = rows.first { return s }
        let s = StreakState()
        modelContext.insert(s)
        try? modelContext.save()
        return s
    }

    /// Call at trip end with day's score & protection flag.
    func recordDay(score: Double, hadProtectionViolation: Bool, now: Date = .now) {
        let s = state()
        let good = score >= 80 && !hadProtectionViolation
        let cal = Calendar.current
        if let last = s.lastGoodDay, cal.isDate(last, inSameDayAs: now) {
            return
        }
        if good {
            if let last = s.lastGoodDay,
               let yesterday = cal.date(byAdding: .day, value: -1, to: now),
               cal.isDate(last, inSameDayAs: yesterday) {
                s.currentDays += 1
            } else if s.lastGoodDay == nil {
                s.currentDays = 1
            } else {
                s.currentDays = 1
            }
            s.lastGoodDay = now
            s.bestDays = max(s.bestDays, s.currentDays)
            if s.currentDays > 0, s.currentDays % 10 == 0 {
                s.shieldsAvailable += 1
            }
        } else {
            if s.shieldsAvailable > 0 {
                s.shieldsAvailable -= 1
            } else {
                s.currentDays = 0
            }
        }
        try? modelContext.save()
    }

    func addPoints(_ points: Int) {
        let s = state()
        s.totalPoints += points
        try? modelContext.save()
    }

    static func level(for points: Int) -> Int {
        var level = 1
        while 100 * pow(Double(level), 1.35) <= Double(points) {
            level += 1
            if level > 100 { break }
        }
        return max(1, level)
    }
}
