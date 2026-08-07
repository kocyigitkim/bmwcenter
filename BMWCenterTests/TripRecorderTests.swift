import XCTest
import SwiftData
@testable import BMWCenter

@MainActor
final class TripRecorderTests: XCTestCase {
    func testTripStateTransitions() async {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.autoRecordTrips = true
        settings.startThresholdKmh = 5
        settings.stopDelayS = 120
        settings.useMockAdapter = true

        let container = StorageStack.makeContainer()
        let context = ModelContext(container)
        // Use in-memory via temporary - StorageStack may use disk; OK for test
        let repo = TripRepository(modelContext: context, settings: settings)
        let location = LocationProvider()
        let recorder = TripRecorder(settings: settings, repository: repo, locationProvider: location)

        XCTAssertEqual(recorder.state, .idle)

        // Armed on engine
        var snap = VehicleSnapshot()
        snap.rpm = 800
        snap.speedKmh = 0
        // Direct state machine via public API
        recorder.manualStart()
        XCTAssertTrue(recorder.state.isActive)
        recorder.manualStop()
        // Short trip may be discarded
        XCTAssertEqual(recorder.state, .idle)
        _ = snap
        _ = repo
    }

    func testShortTripDiscardedViaManual() async throws {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        let schema = Schema([Trip.self, TripSample.self, RefuelEntry.self, VehicleProfile.self, DTCRecord.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try! ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)
        let repo = TripRepository(modelContext: context, settings: settings)
        let recorder = TripRecorder(settings: settings, repository: repo, locationProvider: LocationProvider())

        recorder.manualStart()
        XCTAssertTrue(recorder.state.isActive)
        // Immediate stop → discard (< 0.3 km and < 60s)
        recorder.manualStop()
        XCTAssertEqual(recorder.state, .idle)
        XCTAssertTrue(repo.recentTrips(limit: 10).isEmpty)
    }
}
