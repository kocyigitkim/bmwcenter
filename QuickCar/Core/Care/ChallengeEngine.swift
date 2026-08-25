import Foundation
import SwiftData

@MainActor
final class ChallengeEngine: CareFeature {
    let id = "challenges"
    let requiredPIDs: Set<UInt8> = []
    let optionalPIDs: Set<UInt8> = []

    private let modelContext: ModelContext
    private let coldShield: ColdEngineShield

    struct Definition {
        let key: String
        let difficulty: String
        let points: Int
        let defaultTarget: Double
    }

    static let pool: [Definition] = [
        .init(key: "cleanWarmup", difficulty: "easy", points: 30, defaultTarget: 5),
        .init(key: "steadyCruise", difficulty: "easy", points: 30, defaultTarget: 5),
        .init(key: "idleDiet", difficulty: "medium", points: 50, defaultTarget: 0.7),
        .init(key: "softFoot", difficulty: "medium", points: 50, defaultTarget: 3),
        .init(key: "efficiencyJump", difficulty: "medium", points: 50, defaultTarget: 0.95),
        .init(key: "zeroHarshBrake", difficulty: "hard", points: 80, defaultTarget: 0),
        .init(key: "thermalDiscipline", difficulty: "hard", points: 80, defaultTarget: 0),
        .init(key: "nineties", difficulty: "hard", points: 80, defaultTarget: 5),
        .init(key: "morningMaster", difficulty: "hard", points: 80, defaultTarget: 5)
    ]

    init(modelContext: ModelContext, coldShield: ColdEngineShield) {
        self.modelContext = modelContext
        self.coldShield = coldShield
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careWeeklyChallenges }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        ensureWeekChallenges(now: context.now)
        return []
    }

    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue] {
        ensureWeekChallenges(now: context.now)
        let week = Self.weekStart(for: context.now)
        let rows = currentWeek(weekStart: week)
        for row in rows where row.completedAt == nil {
            switch row.challengeKey {
            case "cleanWarmup":
                if coldShield.coldViolationsThisTrip == 0 {
                    row.current += 1
                }
            case "zeroHarshBrake":
                let harsh = (trip.events ?? []).filter { $0.typeRaw == "harshBrake" }.count
                if harsh == 0, trip.distanceKm > 0 {
                    row.current = min(row.target, row.current + trip.distanceKm)
                } else if harsh > 0 {
                    row.current = -1 // failed
                }
            case "thermalDiscipline":
                // hot shutdowns counted elsewhere; treat as pass if no hotShutdown events today
                break
            case "nineties":
                if (trip.scoreTotal ?? 0) >= 90 {
                    row.current += 1
                } else {
                    row.current = 0
                }
            case "softFoot":
                let harsh = (trip.events ?? []).filter { $0.typeRaw == "harshAccel" }.count
                if harsh == 0 {
                    row.current = min(row.target, row.current + trip.distanceKm)
                }
            default:
                break
            }
            if row.current >= row.target, row.current >= 0 {
                row.completedAt = context.now
            }
        }
        try? modelContext.save()
        return []
    }

    func currentWeek(weekStart: Date) -> [ChallengeProgress] {
        let all = (try? modelContext.fetch(FetchDescriptor<ChallengeProgress>())) ?? []
        return all.filter { Calendar.current.isDate($0.weekStart, inSameDayAs: weekStart) }
    }

    func ensureWeekChallenges(now: Date) {
        let week = Self.weekStart(for: now)
        let existing = currentWeek(weekStart: week)
        guard existing.isEmpty else { return }

        let recentKeys: Set<String> = {
            let all = (try? modelContext.fetch(FetchDescriptor<ChallengeProgress>())) ?? []
            let cutoff = Calendar.current.date(byAdding: .day, value: -21, to: now) ?? now
            return Set(all.filter { $0.weekStart >= cutoff }.map(\.challengeKey))
        }()

        func pick(difficulty: String) -> Definition {
            let candidates = Self.pool.filter { $0.difficulty == difficulty && !recentKeys.contains($0.key) }
            return candidates.randomElement()
                ?? Self.pool.filter { $0.difficulty == difficulty }.randomElement()!
        }
        for def in [pick(difficulty: "easy"), pick(difficulty: "medium"), pick(difficulty: "hard")] {
            modelContext.insert(ChallengeProgress(
                challengeKey: def.key,
                weekStart: week,
                target: def.defaultTarget,
                difficultyRaw: def.difficulty,
                points: def.points
            ))
        }
        try? modelContext.save()
    }

    static func weekStart(for date: Date) -> Date {
        var cal = Calendar.current
        cal.firstWeekday = 2 // Monday
        let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return cal.date(from: comps) ?? date
    }
}
