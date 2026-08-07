import XCTest
@testable import BMWCenter

final class FormatterTests: XCTestCase {
    func testNilUnavailable() {
        XCTAssertEqual(Formatters.number(nil), Formatters.unavailable)
        XCTAssertEqual(Formatters.speed(nil, settings: AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)), Formatters.unavailable)
    }

    func testMetricSpeed() {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.unitSystem = .metric
        let text = Formatters.speed(100, settings: settings)
        XCTAssertTrue(text.contains("100"))
        XCTAssertTrue(text.contains("km/h") || text.contains(String(localized: "unit.kmh", table: "Localizable")))
    }

    func testImperialSpeed() {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.unitSystem = .imperial
        let text = Formatters.speed(100, settings: settings)
        XCTAssertTrue(text.contains("62"))
    }

    func testTempF() {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.temperatureUnit = .fahrenheit
        let text = Formatters.temperature(0, settings: settings)
        XCTAssertTrue(text.contains("32"))
    }

    func testConsumptionUnits() {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.consumptionUnit = .mpgUS
        let text = Formatters.consumption(l100km: 10, settings: settings)
        XCTAssertTrue(text.contains("23.5") || text.contains("23,5") || text.contains("24"))
    }

    func testDurationShort() {
        let text = Formatters.duration(42 * 60)
        XCTAssertFalse(text.isEmpty)
    }

    func testLiveDuration() {
        let text = Formatters.liveDuration(2535)
        XCTAssertTrue(text.contains("42") || text.contains(":"))
    }

    func testTextBar() {
        XCTAssertEqual(TextBar.make(0.625, width: 8), "█████░░░")
        XCTAssertEqual(TextBar.make(0, width: 8), "░░░░░░░░")
        XCTAssertEqual(TextBar.make(1, width: 8), "████████")
        XCTAssertEqual(TextBar.make(0.5, width: 8), "████░░░░")
    }

    func testMetricFormatterAppLocaleEN() {
        UserDefaults.standard.set("en", forKey: "settings.languageCode")
        let text = MetricFormatter.consumption(17.5)
        XCTAssertTrue(text.contains("17.5"), text)
    }

    func testMetricFormatterAppLocaleTR() {
        UserDefaults.standard.set("tr", forKey: "settings.languageCode")
        let text = MetricFormatter.consumption(17.5, locale: Locale(identifier: "tr"))
        XCTAssertTrue(text.contains("17,5"), text)
        UserDefaults.standard.set("en", forKey: "settings.languageCode")
    }
}
