import XCTest
@testable import BMWCenter

@MainActor
final class CueSchedulerTests: XCTestCase {
    private func makeScheduler() -> CueScheduler {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let announcer = AudioAnnouncer(settings: settings)
        return CueScheduler(announcer: announcer)
    }

    func testCriticalBypassesSameCueInterval() {
        let s = makeScheduler()
        let now = Date()
        let cue = CareCue(id: "x", text: "Engine overheating. Stop safely.", severity: .critical)
        XCTAssertTrue(s.wouldAccept(cue, now: now))
        s.recordAccepted(cue, now: now)
        XCTAssertTrue(s.wouldAccept(cue, now: now.addingTimeInterval(1)))
    }

    func testCoachMinInterval() {
        let s = makeScheduler()
        let now = Date()
        let a = CareCue(id: "a", text: "Ease off. Smooth is cheaper.", severity: .coach)
        let b = CareCue(id: "b", text: "Hold a steady speed.", severity: .coach)
        XCTAssertTrue(s.wouldAccept(a, now: now))
        s.recordAccepted(a, now: now)
        XCTAssertFalse(s.wouldAccept(b, now: now.addingTimeInterval(10)))
        XCTAssertTrue(s.wouldAccept(b, now: now.addingTimeInterval(26)))
    }

    func testSameCueInterval() {
        let s = makeScheduler()
        let now = Date()
        let cue = CareCue(id: "same", text: "Ease off. Smooth is cheaper.", severity: .protective)
        s.recordAccepted(cue, now: now)
        XCTAssertFalse(s.wouldAccept(cue, now: now.addingTimeInterval(60)))
        XCTAssertTrue(s.wouldAccept(cue, now: now.addingTimeInterval(121)))
    }

    func testHourlyCoachCap() {
        let s = makeScheduler()
        let now = Date()
        for i in 0..<12 {
            let cue = CareCue(id: "c\(i)", text: "Ease off. Smooth is cheaper.", severity: .coach)
            // Space coaches by 30s so interval allows
            let t = now.addingTimeInterval(Double(i) * 30)
            XCTAssertTrue(s.wouldAccept(cue, now: t), "failed at \(i)")
            s.recordAccepted(cue, now: t)
        }
        let overflow = CareCue(id: "overflow", text: "Hold a steady speed.", severity: .coach)
        XCTAssertFalse(s.wouldAccept(overflow, now: now.addingTimeInterval(12 * 30 + 30)))
    }

    func testPriorityOrdering() {
        XCTAssertTrue(CueSeverity.critical > CueSeverity.protective)
        XCTAssertTrue(CueSeverity.protective > CueSeverity.coach)
        XCTAssertTrue(CueSeverity.coach > CueSeverity.celebration)
    }
}
