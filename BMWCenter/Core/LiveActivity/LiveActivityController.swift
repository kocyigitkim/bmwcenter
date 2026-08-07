import Foundation
import ActivityKit

@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()

    private var activity: Activity<TripActivityAttributes>?
    private var lastUpdate = Date.distantPast

    func start(vehicleName: String, startedAt: Date) {
        start(startedAt: startedAt, vehicleName: vehicleName)
    }

    func start(startedAt: Date, vehicleName: String) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        end()
        let attributes = TripActivityAttributes(startedAt: startedAt, vehicleName: vehicleName)
        let state = TripActivityAttributes.ContentState(
            distanceKm: 0,
            durationS: 0,
            fuelUsedL: 0,
            avgL100: 0,
            speedKmh: 0,
            score: nil
        )
        do {
            activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil
            )
        } catch {
            Log.error("Live Activity start failed: \(error)")
        }
    }

    func update(live: LiveTripMetrics, speedKmh: Double, score: Double?) {
        update(
            distanceKm: live.distanceKm,
            durationS: live.durationS,
            fuelUsedL: live.fuelUsedL,
            avgL100: live.avgL100 ?? 0,
            speedKmh: speedKmh,
            score: score
        )
    }

    func update(
        distanceKm: Double,
        durationS: Double,
        fuelUsedL: Double,
        avgL100: Double,
        speedKmh: Double,
        score: Double?
    ) {
        guard let activity else { return }
        let now = Date()
        guard now.timeIntervalSince(lastUpdate) >= 5 else { return }
        lastUpdate = now
        let state = TripActivityAttributes.ContentState(
            distanceKm: distanceKm,
            durationS: durationS,
            fuelUsedL: fuelUsedL,
            avgL100: avgL100,
            speedKmh: speedKmh,
            score: score
        )
        Task {
            await activity.update(.init(state: state, staleDate: nil))
        }
    }

    func end() {
        guard let activity else { return }
        let finalState = activity.content.state
        Task {
            await activity.end(
                .init(state: finalState, staleDate: nil),
                dismissalPolicy: .after(.now + 300)
            )
        }
        self.activity = nil
    }
}
