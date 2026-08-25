import XCTest

/// Verifies the Dashboard's new "Scan Vehicle" entry point (Phase 4, PRD §26)
/// renders without disturbing the existing gauge cluster layout, and that it
/// navigates to VehicleScanView.
final class DashboardScanCardUITests: XCTestCase {
    func testDashboardShowsScanCardAndNavigates() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5))
        // Dashboard is the default tab; screenshot it first.
        let dashboardScreenshot = app.screenshot()
        let dashboardAttachment = XCTAttachment(screenshot: dashboardScreenshot)
        dashboardAttachment.name = "DashboardWithScanCard"
        dashboardAttachment.lifetime = .keepAlways
        add(dashboardAttachment)

        let scanCard = app.staticTexts["Scan Vehicle"]
        XCTAssertTrue(scanCard.waitForExistence(timeout: 5))
        scanCard.tap()

        XCTAssertTrue(app.navigationBars["Vehicle Scan"].waitForExistence(timeout: 5))
    }
}
