import XCTest

final class SmokeTests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testTabsOpenWithoutCrash() {
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5))

        let tabs = ["Dashboard", "Trips", "Fuel", "Insights", "Settings"]
        for name in tabs {
            let button = tabBar.buttons[name]
            if button.exists {
                button.tap()
            } else {
                // Localized / system fallback — tap by index
                break
            }
        }

        // Ensure we still have 5 tab items
        XCTAssertGreaterThanOrEqual(tabBar.buttons.count, 5)
        for i in 0..<min(5, tabBar.buttons.count) {
            tabBar.buttons.element(boundBy: i).tap()
            XCTAssertTrue(app.exists)
        }
    }
}
