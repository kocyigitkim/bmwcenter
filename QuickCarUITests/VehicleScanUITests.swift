import XCTest

/// Verifies the new Vehicle Scan screen (Phase 4, PRD §30/§31) opens, runs a
/// scan against the mock adapter, and renders a result without crashing.
final class VehicleScanUITests: XCTestCase {
    func testRunScanFromSettings() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5))
        let settingsTab = tabBar.buttons["Settings"]
        if settingsTab.exists {
            settingsTab.tap()
        } else {
            tabBar.buttons.element(boundBy: min(4, tabBar.buttons.count - 1)).tap()
        }

        let scanRow = app.staticTexts["Vehicle Scan"]
        var attempts = 0
        while !scanRow.exists, attempts < 10 {
            app.swipeUp()
            attempts += 1
        }
        XCTAssertTrue(scanRow.waitForExistence(timeout: 5))
        scanRow.tap()

        XCTAssertTrue(app.navigationBars["Vehicle Scan"].waitForExistence(timeout: 5))

        let scanButton = app.buttons["Scan Vehicle"]
        XCTAssertTrue(scanButton.waitForExistence(timeout: 5))
        scanButton.tap()

        // Mock adapter — scan should complete quickly and show a status row.
        XCTAssertTrue(app.staticTexts["Status"].waitForExistence(timeout: 10))

        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "VehicleScanView"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
