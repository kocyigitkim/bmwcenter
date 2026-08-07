import Foundation

enum Formatters {
    private static let durationComponents: DateComponentsFormatter = {
        let f = DateComponentsFormatter()
        f.allowedUnits = [.hour, .minute]
        f.unitsStyle = .abbreviated
        f.zeroFormattingBehavior = .dropLeading
        return f
    }()

    private static let liveDuration: DateComponentsFormatter = {
        let f = DateComponentsFormatter()
        f.allowedUnits = [.hour, .minute, .second]
        f.unitsStyle = .positional
        f.zeroFormattingBehavior = [.pad]
        return f
    }()

    private static let currency: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        return f
    }()

    static let unavailable = String(localized: "common.value.unavailable", table: "Localizable")

    static func number(_ value: Double?, digits: Int = 1) -> String {
        guard let value else { return unavailable }
        return MetricFormatter.number(value, fractionLength: digits)
    }

    static func speed(_ kmh: Double?, settings: AppSettings) -> String {
        guard let kmh else { return unavailable }
        let value: Double
        let unit: String
        switch settings.unitSystem {
        case .metric:
            value = kmh
            unit = String(localized: "unit.kmh", table: "Localizable")
        case .imperial:
            value = kmh * 0.621371
            unit = String(localized: "unit.mph", table: "Localizable")
        }
        return "\(number(value, digits: 0)) \(unit)"
    }

    static func distance(_ km: Double?, settings: AppSettings) -> String {
        guard let km else { return unavailable }
        switch settings.unitSystem {
        case .metric:
            return "\(number(km, digits: 1)) km"
        case .imperial:
            return "\(number(km * 0.621371, digits: 1)) mi"
        }
    }

    static func temperature(_ celsius: Double?, settings: AppSettings) -> String {
        guard let celsius else { return unavailable }
        switch settings.temperatureUnit {
        case .celsius:
            return "\(number(celsius, digits: 0)) \(String(localized: "unit.celsius", table: "Localizable"))"
        case .fahrenheit:
            let f = celsius * 9 / 5 + 32
            return "\(number(f, digits: 0)) \(String(localized: "unit.fahrenheit", table: "Localizable"))"
        }
    }

    static func rpm(_ value: Double?) -> String {
        guard let value else { return unavailable }
        return "\(number(value, digits: 0)) \(String(localized: "unit.rpm", table: "Localizable"))"
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return unavailable }
        return "\(number(value, digits: 0))\(String(localized: "unit.percent", table: "Localizable"))"
    }

    static func voltage(_ value: Double?) -> String {
        guard let value else { return unavailable }
        return "\(number(value, digits: 1)) \(String(localized: "unit.volt", table: "Localizable"))"
    }

    static func boost(_ bar: Double?, settings: AppSettings) -> String {
        guard let bar else { return unavailable }
        switch settings.pressureUnit {
        case .bar:
            let sign = bar >= 0 ? "+" : ""
            return "\(sign)\(number(bar, digits: 2)) bar"
        case .kpa:
            return "\(number(bar * 100, digits: 0)) kPa"
        case .psi:
            return "\(number(bar * 100 * 0.145038, digits: 1)) psi"
        }
    }

    static func liters(_ value: Double?) -> String {
        guard let value else { return unavailable }
        return "\(number(value, digits: 2)) \(String(localized: "unit.liter", table: "Localizable"))"
    }

    /// Convert L/100km to display string per settings.
    static func consumption(l100km: Double?, idleLh: Double? = nil, speedKmh: Double? = nil, settings: AppSettings) -> String {
        if let speed = speedKmh, speed <= 3, let idleLh {
            return "\(number(idleLh, digits: 1)) \(String(localized: "unit.literPerHour", table: "Localizable"))"
        }
        guard let l100km, l100km >= 0.5, l100km <= 60 else { return unavailable }
        let value: Double
        let unitKey: String
        switch settings.consumptionUnit {
        case .l100km:
            value = l100km
            unitKey = "unit.l100km"
        case .kmPerL:
            value = 100 / l100km
            unitKey = "unit.kmPerL"
        case .mpgUS:
            value = 235.215 / l100km
            unitKey = "unit.mpgUS"
        case .mpgUK:
            value = 282.481 / l100km
            unitKey = "unit.mpgUK"
        }
        return "\(number(value, digits: 1)) \(String(localized: String.LocalizationValue(unitKey), table: "Localizable"))"
    }

    static func duration(_ seconds: Double) -> String {
        if seconds < 3600 {
            let mins = Int((seconds / 60).rounded())
            return durationComponents.string(from: DateComponents(minute: max(mins, 0))) ?? unavailable
        }
        return durationComponents.string(from: seconds) ?? unavailable
    }

    static func liveDuration(_ seconds: Double) -> String {
        liveDuration.string(from: max(0, seconds)) ?? "00:00:00"
    }

    static func currency(_ amount: Double, code: String) -> String {
        currency.currencyCode = code
        return currency.string(from: NSNumber(value: amount)) ?? number(amount, digits: 2)
    }

    static func truncate(_ text: String, max: Int) -> String {
        guard text.count > max else { return text }
        return String(text.prefix(max - 1)) + "…"
    }
}
