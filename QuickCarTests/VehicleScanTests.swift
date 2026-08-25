import XCTest
@testable import QuickCar

final class VehicleScanTests: XCTestCase {
    private func readiness(milOn: Bool) -> ReadinessStatus {
        ReadinessStatus(milOn: milOn, dtcCount: 0, monitors: [])
    }

    func testNoDTCsAndNoReadinessDataIsGood() {
        let status = VehicleScanClassifier.classify(dtcs: [], readiness: nil)
        XCTAssertEqual(status, .good)
    }

    func testMILOnIsCriticalRegardlessOfDTCs() {
        let status = VehicleScanClassifier.classify(dtcs: [], readiness: readiness(milOn: true))
        XCTAssertEqual(status, .critical)
    }

    func testPermanentDTCIsCritical() {
        let dtcs = [DTC(code: "P0171", status: .permanent)]
        let status = VehicleScanClassifier.classify(dtcs: dtcs, readiness: readiness(milOn: false))
        XCTAssertEqual(status, .critical)
    }

    func testStoredOrPendingDTCWithoutMILIsAttention() {
        let dtcs = [DTC(code: "P0171", status: .stored)]
        let status = VehicleScanClassifier.classify(dtcs: dtcs, readiness: readiness(milOn: false))
        XCTAssertEqual(status, .attention)

        let pendingDtcs = [DTC(code: "P0300", status: .pending)]
        let pendingStatus = VehicleScanClassifier.classify(dtcs: pendingDtcs, readiness: nil)
        XCTAssertEqual(pendingStatus, .attention)
    }

    func testScanResultDerivedCountsGroupByStatus() {
        let result = VehicleScanResult(
            performedAt: Date(),
            dtcs: [
                DTC(code: "P0171", status: .stored),
                DTC(code: "P0172", status: .stored),
                DTC(code: "P0300", status: .pending),
                DTC(code: "P0420", status: .permanent)
            ],
            readiness: nil,
            overallStatus: .critical
        )
        XCTAssertEqual(result.storedCount, 2)
        XCTAssertEqual(result.pendingCount, 1)
        XCTAssertEqual(result.permanentCount, 1)
    }

    func testIncompleteReadinessWithoutDTCsIsUnknown() {
        let notReady = ReadinessParser.parse(bytes: [0x00, 0x11, 0x00, 0x00])
        XCTAssertEqual(notReady?.isFullyReady, false)
        let status = VehicleScanClassifier.classify(dtcs: [], readiness: notReady)
        XCTAssertEqual(status, .unknown)
    }
}
