import Foundation

/// Number formatting bound to app language (not device region).
enum MetricFormatter {
    private static let languageDefaultsKey = "settings.languageCode"

    static var appLocale: Locale {
        let code = UserDefaults.standard.string(forKey: languageDefaultsKey) ?? "en"
        return Locale(identifier: code)
    }

    static func number(_ value: Double, fractionLength: Int, locale: Locale? = nil) -> String {
        let loc = locale ?? appLocale
        return value.formatted(
            .number
            .precision(.fractionLength(fractionLength))
            .locale(loc)
        )
    }

    static func optionalNumber(_ value: Double?, fractionLength: Int, locale: Locale? = nil) -> String? {
        guard let value else { return nil }
        return number(value, fractionLength: fractionLength, locale: locale)
    }

    /// RPM / large integers with grouping separator from app locale.
    static func integer(_ value: Double, locale: Locale? = nil) -> String {
        let loc = locale ?? appLocale
        return value.formatted(
            .number
            .precision(.fractionLength(0))
            .locale(loc)
        )
    }

    static func speed(_ value: Double, locale: Locale? = nil) -> String {
        number(value, fractionLength: 0, locale: locale)
    }

    static func rpm(_ value: Double, locale: Locale? = nil) -> String {
        integer(value, locale: locale)
    }

    static func temperature(_ value: Double, locale: Locale? = nil) -> String {
        number(value, fractionLength: 0, locale: locale)
    }

    static func fuelLevel(_ value: Double, locale: Locale? = nil) -> String {
        number(value, fractionLength: 0, locale: locale)
    }

    static func consumption(_ value: Double, locale: Locale? = nil) -> String {
        let digits = value < 100 ? 1 : 0
        return number(value, fractionLength: digits, locale: locale)
    }

    static func voltage(_ value: Double, locale: Locale? = nil) -> String {
        number(value, fractionLength: 1, locale: locale)
    }

    static func boost(_ value: Double, unitIsBar: Bool, locale: Locale? = nil) -> String {
        number(value, fractionLength: unitIsBar ? 2 : 0, locale: locale)
    }

    static func distance(_ value: Double, locale: Locale? = nil) -> String {
        let digits = value < 1000 ? 1 : 0
        return number(value, fractionLength: digits, locale: locale)
    }

    static func liveDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }
}
