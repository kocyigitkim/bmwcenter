import XCTest

/// Verifies the new Capability Scan screen (Phase 3, PRD §24) opens without
/// crashing and renders its rows, and captures a screenshot for visual review.
final class CapabilityScanUITests: XCTestCase {
    func testOpenCapabilityScanFromSettings() {
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

        // The Diagnostics section (containing the Capabilities row) is well
        // down a long Settings list — scroll until it's materialized.
        let capabilitiesRow = app.staticTexts["Capabilities"]
        var attempts = 0
        while !capabilitiesRow.exists, attempts < 10 {
            app.swipeUp()
            attempts += 1
        }
        XCTAssertTrue(capabilitiesRow.waitForExistence(timeout: 5))
        capabilitiesRow.tap()

        let navTitle = app.navigationBars["Capabilities"]
        XCTAssertTrue(navTitle.waitForExistence(timeout: 5), "CapabilityScanView should push and show its nav title")

        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "CapabilityScanView"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
