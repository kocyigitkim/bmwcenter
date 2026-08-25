import Foundation

/// Sistem × şiddet bazlı genel yönlendirme metni (kod-özel tamir adımı değil —
/// doğrulanamayan teknik iddia riski taşıdığı için sadece güvenli, genel rehberlik).
enum DTCGuidance {
    static func text(system: String?, severity: String?) -> String {
        let systemKey = system ?? "other"
        let severityKey = severity ?? "medium"
        let key = "dtc.guidance.\(systemKey).\(severityKey)"
        let value = String(localized: String.LocalizationValue(key), table: "Localizable")
        // Localizable lookup falls back to the key itself when missing — guard against that.
        guard value != key else {
            let fallbackKey = "dtc.guidance.other.\(severityKey)"
            return String(localized: String.LocalizationValue(fallbackKey), table: "Localizable")
        }
        return value
    }
}
