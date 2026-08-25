import XCTest
@testable import QuickCar

final class CapabilityResolverTests: XCTestCase {
    func testGenericFeatureUnknownWithNoAdapterCapabilities() {
        let reason = CapabilityResolver.resolve(
            feature: .dtcRead, adapterCapabilities: [], vehiclePlatform: .universal
        )
        XCTAssertEqual(reason.state, .unknown)
    }

    func testGenericFeatureSupportedOnceGenericOBDObserved() {
        let reason = CapabilityResolver.resolve(
            feature: .dtcRead, adapterCapabilities: [.genericOBD], vehiclePlatform: .universal
        )
        XCTAssertEqual(reason.state, .supported)
    }

    func testBMWExtendedDataUnsupportedOnUniversalPlatform() {
        let reason = CapabilityResolver.resolve(
            feature: .extendedEngineData,
            adapterCapabilities: [.genericOBD],
            vehiclePlatform: .universal
        )
        XCTAssertEqual(reason.state, .unsupported)
        XCTAssertNotNil(reason.detail)
    }

    func testBMWExtendedDataSupportedOnBMWPlatformWithGenericOBD() {
        let reason = CapabilityResolver.resolve(
            feature: .extendedEngineData,
            adapterCapabilities: [.genericOBD],
            vehiclePlatform: .bmwF30N13
        )
        XCTAssertEqual(reason.state, .supported)
    }

    func testBMWExtendedDataUnknownOnBMWPlatformWithoutGenericOBD() {
        let reason = CapabilityResolver.resolve(
            feature: .extendedEngineData,
            adapterCapabilities: [],
            vehiclePlatform: .bmwF30N13
        )
        XCTAssertEqual(reason.state, .unknown)
    }

    func testResolveAllReturnsEveryFeatureExactlyOnce() {
        let reasons = CapabilityResolver.resolveAll(
            adapterCapabilities: [.genericOBD, .liveData],
            vehiclePlatform: .bmwFSeries
        )
        XCTAssertEqual(reasons.count, VehicleFeature.allCases.count)
        XCTAssertEqual(Set(reasons.map(\.feature)), Set(VehicleFeature.allCases))
    }
}
